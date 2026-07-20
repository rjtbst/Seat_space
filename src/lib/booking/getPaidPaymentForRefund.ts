// src/lib/booking/getPaidPaymentForRefund.ts
/**
 * Shared read for "find the paid payment record for a booking, to compute
 * a refund off of" — used by both of student-bookings.ts's cancellation
 * paths (the pre-check-in 'confirmed' cancel and the post-check-in
 * 'checked_in' late-cancel, which apply different refund percentages but
 * both start from the same payment lookup).
 *
 * Deliberately narrow, unlike seats/libraries/bookings repositories: this
 * is the ONLY duplicated payments query found in the codebase (the other
 * ~23 payments call sites — webhooks, cron payout/reconciliation jobs,
 * admin refund/payout actions, revenue aggregation — are each genuinely
 * single-purpose with their own guard conditions, e.g. admin-payouts.ts's
 * `.eq('escrow_status', 'held')` on its update is a safety guard, not
 * accidental duplication). A full "payments repository" would mostly
 * relocate one-off financial queries into a bigger, harder-to-audit file
 * without removing real duplication — the opposite of the point. This
 * lives in lib/booking/ (not src/repositories/) to match how this codebase
 * already organizes booking-domain logic (escrow.ts, refund-netting.ts).
 *
 * commission_rate_bps is always selected (the superset of what either
 * call site needs) — omitting it from the return value for the call site
 * that doesn't use it is a no-op, not a behavior change.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export type PaidPaymentForRefund = {
  id: string
  amount: number
  escrow_status: string | null
  owner_payout_amount: number | null
  commission_rate_bps: number | null
}

export async function getPaidPaymentForRefund(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<PaidPaymentForRefund | null> {
  const { data } = await supabase
    .from('payments')
    .select('id, amount, escrow_status, owner_payout_amount, commission_rate_bps')
    .eq('booking_id', bookingId)
    .eq('status', 'paid')
    .maybeSingle()
  return (data as any) ?? null
}
