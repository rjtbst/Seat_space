// lib/actions/payout-setup.ts
'use server'

/**
 * Owner-facing payout destination setup. Owners register a bank account
 * and/or a UPI VPA; the daily payout sweep (see app/api/cron/run-payouts)
 * uses whichever is set as `payout_default_method` to send RazorpayX
 * Payouts. Both can be registered for flexibility; the owner picks the
 * default explicitly.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSupabaseUser } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import {
  createRazorpayContact,
  createRazorpayFundAccount,
} from '@/lib/razorpay/server'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

export type PayoutSetupView = {
  payoutVpa: string | null
  payoutBankAccountNumber: string | null // masked, last 4 digits only
  payoutBankIfsc: string | null
  payoutBankAccountName: string | null
  payoutDefaultMethod: 'bank_account' | 'vpa' | null
  hasBankAccount: boolean
  hasVpa: boolean
}

function maskAccountNumber(acc: string | null): string | null {
  if (!acc) return null
  if (acc.length <= 4) return acc
  return `••••${acc.slice(-4)}`
}

export async function getPayoutSetup(): Promise<PayoutSetupView | null> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('payout_vpa, payout_bank_account_number, payout_bank_ifsc, payout_bank_account_name, payout_default_method, razorpay_fund_account_id_bank, razorpay_fund_account_id_vpa')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return null

  return {
    payoutVpa: (profile as any).payout_vpa ?? null,
    payoutBankAccountNumber: maskAccountNumber((profile as any).payout_bank_account_number ?? null),
    payoutBankIfsc: (profile as any).payout_bank_ifsc ?? null,
    payoutBankAccountName: (profile as any).payout_bank_account_name ?? null,
    payoutDefaultMethod: (profile as any).payout_default_method ?? null,
    hasBankAccount: !!(profile as any).razorpay_fund_account_id_bank,
    hasVpa: !!(profile as any).razorpay_fund_account_id_vpa,
  }
}

/* ── Bank account setup ──────────────────────────────────────────────── */

const bankSchema = z.object({
  accountName: z.string().min(2).max(120).trim(),
  accountNumber: z.string().min(6).max(30).trim().regex(/^\d+$/, 'Account number must contain only digits'),
  ifsc: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Invalid IFSC code format'),
})

export async function setPayoutBankAccount(
  input: z.infer<typeof bankSchema>,
): Promise<ActionResult> {
  const parsed = bankSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { accountName, accountNumber, ifsc } = parsed.data

  const { data: profile } = await supabase
    .from('users')
    .select('razorpay_contact_id, email, phone, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const service = createServiceSupabaseClient()

  // 1. Ensure a RazorpayX Contact exists for this owner
  let contactId = (profile as any)?.razorpay_contact_id as string | null
  if (!contactId) {
    const contactResult = await createRazorpayContact({
      name: (profile as any)?.full_name ?? accountName,
      email: (profile as any)?.email ?? null,
      contact: (profile as any)?.phone ?? null,
    })
    if (contactResult.success === false) return { success: false, error: contactResult.error }
    contactId = contactResult.data.id
    await service.from('users').update({ razorpay_contact_id: contactId } as never).eq('id', user.id)
  }

  // 2. Create the Fund Account for this bank account
  const fundResult = await createRazorpayFundAccount({
    contactId,
    type: 'bank_account',
    bankAccount: { name: accountName, ifsc: ifsc.toUpperCase(), accountNumber },
  })
  if (fundResult.success === false) return { success: false, error: fundResult.error }

  // 3. Persist — default method is set to bank_account only if nothing else
  // is already configured as default, so re-registering a bank account
  // doesn't silently override an owner's existing VPA preference.
  const { data: current } = await service
    .from('users')
    .select('payout_default_method')
    .eq('id', user.id)
    .maybeSingle()

  await service
    .from('users')
    .update({
      payout_bank_account_name: accountName,
      payout_bank_account_number: accountNumber,
      payout_bank_ifsc: ifsc.toUpperCase(),
      razorpay_fund_account_id_bank: fundResult.data.id,
      payout_default_method: (current as any)?.payout_default_method ?? 'bank_account',
    } as never)
    .eq('id', user.id)

  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}

/* ── UPI VPA setup ───────────────────────────────────────────────────── */

const vpaSchema = z.object({
  vpa: z.string().trim().regex(/^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/, 'Invalid UPI ID format (e.g. name@bank)'),
})

export async function setPayoutVpa(
  input: z.infer<typeof vpaSchema>,
): Promise<ActionResult> {
  const parsed = vpaSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { vpa } = parsed.data

  const { data: profile } = await supabase
    .from('users')
    .select('razorpay_contact_id, email, phone, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const service = createServiceSupabaseClient()

  let contactId = (profile as any)?.razorpay_contact_id as string | null
  if (!contactId) {
    const contactResult = await createRazorpayContact({
      name: (profile as any)?.full_name ?? 'Library Owner',
      email: (profile as any)?.email ?? null,
      contact: (profile as any)?.phone ?? null,
    })
    if (contactResult.success === false) return { success: false, error: contactResult.error }
    contactId = contactResult.data.id
    await service.from('users').update({ razorpay_contact_id: contactId } as never).eq('id', user.id)
  }

  const fundResult = await createRazorpayFundAccount({
    contactId,
    type: 'vpa',
    vpa: { address: vpa },
  })
  if (fundResult.success === false) return { success: false, error: fundResult.error }

  const { data: current } = await service
    .from('users')
    .select('payout_default_method')
    .eq('id', user.id)
    .maybeSingle()

  await service
    .from('users')
    .update({
      payout_vpa: vpa,
      razorpay_fund_account_id_vpa: fundResult.data.id,
      payout_default_method: (current as any)?.payout_default_method ?? 'vpa',
    } as never)
    .eq('id', user.id)

  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}

/* ── Set default payout method ───────────────────────────────────────── */

export async function setDefaultPayoutMethod(
  method: 'bank_account' | 'vpa',
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('razorpay_fund_account_id_bank, razorpay_fund_account_id_vpa')
    .eq('id', user.id)
    .maybeSingle()

  const hasMethod = method === 'bank_account'
    ? !!(profile as any)?.razorpay_fund_account_id_bank
    : !!(profile as any)?.razorpay_fund_account_id_vpa

  if (!hasMethod) {
    return { success: false, error: `You haven't set up a ${method === 'bank_account' ? 'bank account' : 'UPI ID'} yet.` }
  }

  const service = createServiceSupabaseClient()
  await service.from('users').update({ payout_default_method: method } as never).eq('id', user.id)

  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}
