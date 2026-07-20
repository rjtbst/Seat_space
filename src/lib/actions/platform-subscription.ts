// lib/actions/platform-subscription.ts
'use server'

/**
 * Owner-facing platform subscription actions — ₹399/month per library,
 * billed via Razorpay Subscriptions API with a UPI AutoPay (or card)
 * recurring mandate. See lib/razorpay/server.ts for the underlying API
 * calls, and app/api/payment/subscription-webhook/route.ts for the
 * lifecycle event handling (renewals, failures, cancellation).
 *
 * IMPORTANT: platform_subscriptions has NO owner-writable RLS policy at
 * all (see escrow/subscriptions migrations) — every write here goes
 * through the service-role client. Authorization is enforced in
 * application code: every function below re-checks `owner_id = auth
 * user.id` against the row before writing anything.
 */

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import {
  createRazorpayCustomer,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  verifyRazorpaySubscriptionSignature,
} from '@/lib/razorpay/server'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? ''

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

const PLATFORM_PLAN_ID = process.env.RAZORPAY_PLATFORM_PLAN_ID ?? ''
const MONTHLY_AMOUNT_PAISE = 39900 // ₹399.00

/* ══════════════════════════════════════════════════════════════════════════
   GET SUBSCRIPTION STATUS (for a single library)
══════════════════════════════════════════════════════════════════════════ */

export type PlatformSubscriptionView = {
  id: string | null
  status: string | null
  amountRupees: number
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  nextBillingAt: string | null
  gracePeriodEndsAt: string | null
  cancelAtPeriodEnd: boolean
  razorpaySubscriptionId: string | null
}

export async function getPlatformSubscription(libraryId: string): Promise<PlatformSubscriptionView | null> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return null

  // Ownership check via the regular client — owner_view_own_platform_subscription
  // RLS policy already scopes this to the caller's own rows, but we also
  // confirm the library itself belongs to them for a clean "not found" path.
  const { data: lib } = await supabase
    .from('libraries')
    .select('id, owner_id')
    .eq('id', libraryId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!lib) return null

  const { data: sub } = await supabase
    .from('platform_subscriptions')
    .select('id, status, amount_paise, current_period_start, current_period_end, next_billing_at, grace_period_ends_at, cancel_at_period_end, razorpay_subscription_id')
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!sub) {
    return {
      id: null, status: null, amountRupees: MONTHLY_AMOUNT_PAISE / 100,
      currentPeriodStart: null, currentPeriodEnd: null, nextBillingAt: null,
      gracePeriodEndsAt: null, cancelAtPeriodEnd: false, razorpaySubscriptionId: null,
    }
  }

  return {
    id: (sub as any).id,
    status: (sub as any).status,
    amountRupees: ((sub as any).amount_paise ?? MONTHLY_AMOUNT_PAISE) / 100,
    currentPeriodStart: (sub as any).current_period_start,
    currentPeriodEnd: (sub as any).current_period_end,
    nextBillingAt: (sub as any).next_billing_at,
    gracePeriodEndsAt: (sub as any).grace_period_ends_at,
    cancelAtPeriodEnd: !!(sub as any).cancel_at_period_end,
    razorpaySubscriptionId: (sub as any).razorpay_subscription_id,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   GET SUBSCRIPTION PAYMENT HISTORY
══════════════════════════════════════════════════════════════════════════ */

export type PlatformSubscriptionPaymentRow = {
  id: string
  status: string
  amountRupees: number
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  isRetry: boolean
  failureReason: string | null
  createdAt: string
}

export async function getPlatformSubscriptionPaymentHistory(libraryId: string): Promise<PlatformSubscriptionPaymentRow[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data: rows } = await supabase
    .from('platform_subscription_payments')
    .select('id, status, amount_paise, billing_period_start, billing_period_end, is_retry, failure_reason, created_at, owner_id')
    .eq('library_id', libraryId)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (rows ?? []).map((r: any) => ({
    id: r.id,
    status: r.status,
    amountRupees: (r.amount_paise ?? 0) / 100,
    billingPeriodStart: r.billing_period_start,
    billingPeriodEnd: r.billing_period_end,
    isRetry: !!r.is_retry,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
  }))
}

/* ══════════════════════════════════════════════════════════════════════════
   START SUBSCRIPTION
   Creates (or reuses) a platform_subscriptions row + Razorpay customer +
   Razorpay subscription, and returns the hosted checkout URL where the
   owner authorizes their UPI AutoPay mandate.
══════════════════════════════════════════════════════════════════════════ */

export type StartSubscriptionResult = {
  checkoutUrl: string // hosted page fallback — kept for reference/email link, NOT used as the
                       // primary flow anymore (Razorpay's hosted subscription page can return
                       // "Hosted page is not available" on accounts pending full activation,
                       // even in test mode). The in-page Checkout below works regardless.
  keyId: string
  razorpaySubscriptionId: string
  prefill: { name: string; email: string; phone: string }
}

export async function startPlatformSubscription(libraryId: string): Promise<ActionResult<StartSubscriptionResult>> {
  if (!PLATFORM_PLAN_ID) {
    return { success: false, error: 'Platform subscription plan is not configured. Please contact support.' }
  }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: lib } = await supabase
    .from('libraries')
    .select('id, name, owner_id')
    .eq('id', libraryId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!lib) return { success: false, error: 'Library not found or access denied' }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, phone')
    .eq('id', user.id)
    .maybeSingle()

  const service = createServiceSupabaseClient()

  // Re-use an existing row if present (e.g. owner is retrying after a
  // cancelled/expired subscription) rather than creating a duplicate.
  const { data: existing } = await service
    .from('platform_subscriptions')
    .select('id, status, razorpay_subscription_id, razorpay_customer_id')
    .eq('library_id', libraryId)
    .maybeSingle()

  if (existing && (existing as any).status === 'active') {
    return { success: false, error: 'This library already has an active subscription.' }
  }

  // 1. Razorpay customer — reuse if we already created one for this owner
  let customerId = (existing as any)?.razorpay_customer_id as string | null

  if (!customerId) {
    const { data: anyOwnerSub } = await service
      .from('platform_subscriptions')
      .select('razorpay_customer_id')
      .eq('owner_id', user.id)
      .not('razorpay_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()

    customerId = (anyOwnerSub as any)?.razorpay_customer_id ?? null
  }

  if (!customerId) {
    const custResult = await createRazorpayCustomer({
      name: (profile as any)?.full_name ?? 'Library Owner',
      email: (profile as any)?.email ?? null,
      contact: (profile as any)?.phone ?? null,
    })
    if (custResult.success === false) return { success: false, error: custResult.error }
    customerId = custResult.data.id
  }

  // 2. Razorpay subscription (the actual recurring mandate)
  const subResult = await createRazorpaySubscription({
    planId: PLATFORM_PLAN_ID,
    customerId,
    notes: { library_id: libraryId, library_name: (lib as any).name ?? '', owner_id: user.id },
  })
  if (subResult.success === false) return { success: false, error: subResult.error }

  // 3. Upsert local row
  const upsertPayload = {
    library_id: libraryId,
    owner_id: user.id,
    status: 'created',
    razorpay_plan_id: PLATFORM_PLAN_ID,
    razorpay_customer_id: customerId,
    razorpay_subscription_id: subResult.data.id,
    amount_paise: MONTHLY_AMOUNT_PAISE,
  }

  if (existing) {
    await service
      .from('platform_subscriptions')
      .update(upsertPayload as never)
      .eq('id', (existing as any).id)
  } else {
    await service.from('platform_subscriptions').insert(upsertPayload as never)
  }

  if (!subResult.data.short_url) {
    return { success: false, error: 'Razorpay did not return a checkout link. Please try again or contact support.' }
  }

  revalidatePath('/dashboard/my-libraries')
  return {
    success: true,
    data: {
      checkoutUrl: subResult.data.short_url,
      keyId: RAZORPAY_KEY_ID,
      razorpaySubscriptionId: subResult.data.id,
      prefill: {
        name:  (profile as any)?.full_name ?? '',
        email: (profile as any)?.email ?? '',
        phone: (profile as any)?.phone ?? '',
      },
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CONFIRM SUBSCRIPTION CHECKOUT (client-side feedback only)
   Verifies the razorpay_signature returned by the in-page Checkout right
   after the owner authorizes their UPI AutoPay/card mandate. This is purely
   a fast UI signal ("looks legit, we're waiting on confirmation") — it does
   NOT write platform_subscriptions.status itself. The subscription-webhook
   route (subscription.authenticated/.activated) remains the only writer of
   that status, since it's the channel Razorpay guarantees will fire even if
   the owner closes the tab right after paying.
══════════════════════════════════════════════════════════════════════════ */

export async function confirmPlatformSubscriptionCheckout(params: {
  razorpaySubscriptionId: string
  razorpayPaymentId: string
  razorpaySignature: string
}): Promise<ActionResult<{ verified: boolean }>> {
  const { user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const verified = verifyRazorpaySubscriptionSignature(
    params.razorpaySubscriptionId,
    params.razorpayPaymentId,
    params.razorpaySignature,
  )

  return { success: true, data: { verified } }
}

/* ══════════════════════════════════════════════════════════════════════════
   CANCEL SUBSCRIPTION
══════════════════════════════════════════════════════════════════════════ */

export async function cancelPlatformSubscription(
  libraryId: string,
  reason: string,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: lib } = await supabase
    .from('libraries')
    .select('id, owner_id')
    .eq('id', libraryId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!lib) return { success: false, error: 'Library not found or access denied' }

  const service = createServiceSupabaseClient()
  const { data: sub } = await service
    .from('platform_subscriptions')
    .select('id, razorpay_subscription_id, status')
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!sub || !(sub as any).razorpay_subscription_id) {
    return { success: false, error: 'No active subscription found for this library.' }
  }

  const cancelResult = await cancelRazorpaySubscription((sub as any).razorpay_subscription_id, true)
  if (cancelResult.success === false) return { success: false, error: cancelResult.error }

  await service
    .from('platform_subscriptions')
    .update({
      cancel_at_period_end: true,
      cancellation_reason: reason,
    } as never)
    .eq('id', (sub as any).id)

  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}