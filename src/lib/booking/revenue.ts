// src/lib/booking/revenue.ts
/**
 * Single source of truth for revenue calculations.
 *
 * Used by:
 *  - owner.getDashboardStats / getMonthlyRevenue  (per-library, time-windowed)
 *  - owner.getMyLibraries (OwnerLibrary.month_revenue, current calendar month)
 *
 * SOURCE OF TRUTH: the `payments` table, status IN ('paid',
 * 'partially_refunded'), joined to `bookings` for library/date filtering.
 * partially_refunded is included (not just 'paid') because a partial
 * refund does NOT wipe out the whole booking's revenue — only the
 * refunded portion. The remaining owner_payout_amount/
 * platform_commission_amount are netted down at refund-time (see
 * admin-refunds.ts initiateRefund) to reflect exactly what's still owed,
 * so summing them here is already correct without any refund-specific
 * logic in this file. A FULLY refunded payment (status='refunded') is
 * correctly excluded — and even if included, its owner_payout_amount is
 * netted to exactly 0 at refund-time, so it would contribute nothing.
 *
 * OWNER REVENUE = owner_payout_amount, NOT amount. Since the fee-on-top
 * migration, `payments.amount` is the GROSS amount the student paid
 * (library price + platform fee) — it is NOT what the owner receives.
 * `owner_payout_amount` is the actual owner take-home (set at
 * payment-capture time, see confirm_booking_payment_captured, and reduced
 * proportionally on any later refund). For manual/walk-in payments,
 * owner_payout_amount is never set (no platform fee applies there), so we
 * fall back to the full `amount` for those rows.
 *
 * COVERAGE (all four paths insert into `payments` with status='paid'):
 *  - Online student bookings    → student.ts confirmBookingPayment (Razorpay webhook/confirm)
 *  - Owner manual/walk-in        → owner.manualBookSeat (amountPaid > 0)
 *  - Staff manual/walk-in         → staff-seat-actions.seniorManualBook / staffWalkIn
 *  - Subscription payments        → payments.subscription_id is set, booking_id is null
 *
 * SUBSCRIPTION REVENUE: payments rows with subscription_id set (and
 * booking_id null) represent membership-plan purchases — this is real
 * revenue but is NOT tied to a specific booking/library the way session
 * revenue is (a plan can cover multiple libraries via plan_libraries).
 * getLibraryRevenue (booking-based) intentionally EXCLUDES these — see
 * getSubscriptionRevenueForLibrary for the separate calculation that
 * attributes subscription revenue to a library via plan_libraries.
 *
 * "Free" sessions consumed via an active subscription (no per-booking
 * payment) correctly contribute ₹0 to getLibraryRevenue — the subscription
 * payment was already counted once, at purchase time, via
 * getSubscriptionRevenueForLibrary. Summing both would double-count.
 */

import { type SupabaseClient } from '@supabase/supabase-js'

export type RevenueBreakdown = {
  /** Sum of payments.amount for bookings in this library/date range, status='paid' */
  bookingRevenue: number
  /** Sum of subscription-purchase payments attributable to this library (see header) */
  subscriptionRevenue: number
  /** bookingRevenue + subscriptionRevenue */
  total: number
}

/**
 * Revenue from booking-tied payments (online, owner walk-in, staff walk-in —
 * all of these insert a `payments` row with `booking_id` set and
 * `status='paid'`). Filters by `bookings.library_id` and
 * `bookings.start_time` within [startISO, endISO).
 */
export async function getLibraryBookingRevenue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
  startISO:  string,
  endISO:    string,
): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount, owner_payout_amount, bookings!inner(library_id, start_time)')
    .in('status', ['paid', 'partially_refunded'] as never[])
    .eq('bookings.library_id', libraryId)
    .gte('bookings.start_time', startISO)
    .lte('bookings.start_time', endISO)

  if (error || !data) return 0
  // What the OWNER actually receives: owner_payout_amount for online
  // (fee-on-top) bookings, or the full `amount` for manual/walk-in
  // bookings where owner_payout_amount is never set (no platform fee
  // applies — see escrow.ts). Summing raw `amount` here would show the
  // owner money that includes the platform's fee, which was never theirs.
  return (data as any[]).reduce(
    (sum, row) => sum + Number(row.owner_payout_amount ?? row.amount ?? 0),
    0,
  )
}

/**
 * Revenue from subscription purchases attributable to this library.
 *
 * A subscription payment (payments.subscription_id set, booking_id null)
 * is attributed to library X if the purchased plan is linked to X via
 * plan_libraries. For 'cross' scope plans linked to multiple libraries,
 * the FULL payment amount is attributed to EACH linked library — this
 * means summing subscriptionRevenue across all of an owner's libraries can
 * double-count a single cross-library plan purchase. This is intentional:
 * "how much subscription revenue is associated with library X" is a valid
 * per-library question even when the underlying plan also serves other
 * libraries; a true non-duplicating org-wide total should sum DISTINCT
 * subscription payment rows directly, not sum per-library figures.
 */
export async function getSubscriptionRevenueForLibrary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
  startISO:  string,
  endISO:    string,
): Promise<number> {
  const { data: planLinks, error: planLinkErr } = await supabase
    .from('plan_libraries')
    .select('plan_id')
    .eq('library_id', libraryId)

  if (planLinkErr || !planLinks?.length) return 0
  const planIds = (planLinks as any[]).map(p => p.plan_id)

  const { data, error } = await supabase
    .from('payments')
    .select('amount, subscriptions!inner(plan_id, created_at)')
    .eq('status', 'paid' as never)
    .is('booking_id', null)
    .in('subscriptions.plan_id', planIds)
    .gte('created_at', startISO)
    .lte('created_at', endISO)

  if (error || !data) return 0
  return (data as any[]).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

/**
 * Full revenue breakdown for a library over [startISO, endISO).
 * Used by getDashboardStats / getMonthlyRevenue / getMyLibraries.
 */
export async function getLibraryRevenue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
  startISO:  string,
  endISO:    string,
): Promise<RevenueBreakdown> {
  const [bookingRevenue, subscriptionRevenue] = await Promise.all([
    getLibraryBookingRevenue(supabase, libraryId, startISO, endISO),
    getSubscriptionRevenueForLibrary(supabase, libraryId, startISO, endISO),
  ])

  return {
    bookingRevenue,
    subscriptionRevenue,
    total: bookingRevenue + subscriptionRevenue,
  }
}