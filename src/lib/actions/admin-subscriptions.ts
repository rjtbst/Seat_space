// lib/actions/admin-subscriptions.ts
'use server'

import { requireActionRole } from '@/lib/auth/guards'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

export type AdminSubscriptionRow = {
  id: string
  libraryId: string
  libraryName: string
  ownerName: string | null
  status: string
  amountRupees: number
  nextBillingAt: string | null
  gracePeriodEndsAt: string | null
  failedChargeCount: number
  createdAt: string
}

export async function listSubscriptionsForAdmin(
  filter: { status?: string } = {},
): Promise<ActionResult<AdminSubscriptionRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  let query = supabase
    .from('platform_subscriptions')
    .select(`
      id, library_id, status, amount_paise, next_billing_at, grace_period_ends_at,
      failed_charge_count, created_at,
      libraries(name),
      users!platform_subscriptions_owner_id_fkey(full_name)
    `)
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status as any)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  const rows: AdminSubscriptionRow[] = (data ?? []).map((s: any) => {
    const library = Array.isArray(s.libraries) ? s.libraries[0] : s.libraries
    const owner = Array.isArray(s.users) ? s.users[0] : s.users
    return {
      id: s.id,
      libraryId: s.library_id,
      libraryName: library?.name ?? '',
      ownerName: owner?.full_name ?? null,
      status: s.status,
      amountRupees: (s.amount_paise ?? 0) / 100,
      nextBillingAt: s.next_billing_at,
      gracePeriodEndsAt: s.grace_period_ends_at,
      failedChargeCount: s.failed_charge_count ?? 0,
      createdAt: s.created_at,
    }
  })

  return { success: true, data: rows }
}
