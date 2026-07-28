// src/lib/booking/subscriptionEntitlement.ts
/**
 * Shared "does this user have a usable subscription for this library"
 * computation — used by BOTH the student self-service booking flow
 * (student-subscription-booking.ts) and the staff/owner walk-in flow
 * (owner-staff.ts, for a student who shows up in person and staff looks
 * them up instead of the student booking from their phone). Extracted here
 * rather than duplicated a second time, matching how every other
 * booking-mechanics duplication in this codebase has been consolidated
 * into lib/booking/ or services/booking/.
 *
 * NOTE: this is entitlement for AD-HOC hourly bookings that happen to be
 * covered by a subscription (e.g. a different library than the one the
 * student's plan seat is reserved in, or a time outside their reserved
 * window on another eligible plan) — see the "Hourly Bookings" section of
 * the subscription-model spec. It is unrelated to the seat a subscription
 * reserves for its own duration (subscriptions.seat_id) — that seat is
 * used via QR check-in (see lib/actions/students/student-subscription-attendance.ts),
 * not through this booking path.
 *
 * There is no quota / session-limit concept anymore: a subscription is
 * simply "active and not expired" — no consumption counting.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export type EligibleSubscription = {
  id:            string
  planName:      string
  endDate:       string
  timeWindowStart: string | null // "HH:MM:SS", or null = valid any time of day
  timeWindowEnd:   string | null
  daysOfWeek:      number[] | null // 0=Sun..6=Sat, or null = valid every day
}

/**
 * Does a booking from `startIST` to `endIST` (both "HH:MM:SS" or
 * "HH:MM" time-of-day strings, already extracted from whatever the
 * caller is comparing) fit inside this subscription's plan time window?
 * `true` when the plan has no window at all (most plans). Used by the
 * booking UI to disable/explain a subscription option for a specific
 * chosen time BEFORE hitting the server — the real, unbypassable check
 * is still create_subscription_covered_booking() at the database level;
 * this is purely so the student sees why a plan doesn't apply instead of
 * discovering it only after tapping "Confirm."
 */
export function isWithinPlanTimeWindow(
  sub: Pick<EligibleSubscription, 'timeWindowStart' | 'timeWindowEnd'>,
  startTimeOfDay: string,
  endTimeOfDay: string,
): boolean {
  if (!sub.timeWindowStart || !sub.timeWindowEnd) return true
  return startTimeOfDay >= sub.timeWindowStart.slice(0, 5) && endTimeOfDay <= sub.timeWindowEnd.slice(0, 5)
}

/**
 * Same idea as isWithinPlanTimeWindow, for the day-of-week restriction.
 * `startDate`/`endDate` are JS Date objects (or anything Date() accepts)
 * for the actual calendar day of the booking's start/end — both must
 * fall on an allowed day, matching the "fully contained" rule the RPC
 * enforces server-side.
 */
export function isWithinPlanDaysOfWeek(
  sub: Pick<EligibleSubscription, 'daysOfWeek'>,
  startDate: Date,
  endDate: Date,
): boolean {
  if (!sub.daysOfWeek || sub.daysOfWeek.length === 0) return true
  return sub.daysOfWeek.includes(startDate.getDay()) && sub.daysOfWeek.includes(endDate.getDay())
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "Mon-Fri", "Sat-Sun", "Mon, Wed, Fri" — the shortest readable
 *  description of a days_of_week array, for badges/summaries. Falls
 *  back to a comma list when the days aren't one contiguous run. */
export function describeDaysOfWeek(days: number[] | null | undefined): string | null {
  if (!days || days.length === 0 || days.length === 7) return null
  const sorted = [...days].sort((a, b) => a - b)
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (isContiguous && sorted.length > 1) {
    return `${DAY_LABELS[sorted[0]]}-${DAY_LABELS[sorted[sorted.length - 1]]}`
  }
  return sorted.map(d => DAY_LABELS[d]).join(', ')
}

/**
 * Subscriptions must be checked live against end_date (no automatic expiry
 * sweep exists for the student `subscriptions` table) — that's the only
 * thing that determines eligibility now. No session/quota consumption is
 * tracked or counted.
 *
 * Deliberately avoids a doubly-nested PostgREST embedded filter like
 * .eq('plans.plan_libraries.library_id', …) — there's no existing
 * precedent for that pattern anywhere else in this codebase to confirm it
 * behaves as expected against this Postgres/PostgREST version, so this
 * stays as simple, already-proven query shapes instead (matching what
 * initiatePlanSubscription already uses to check the same plan_libraries
 * link).
 */
export async function getEligibleSubscriptions(
  supabase: SupabaseClient<Database>,
  userId: string,
  libraryId: string,
): Promise<EligibleSubscription[]> {
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, end_date, plan_id')
    .eq('user_id', userId)
    .eq('status', 'active' as never)

  if (error || !subs?.length) return []

  const nowMs = Date.now()
  const active = (subs as any[]).filter(s => {
    const endMs = s.end_date ? new Date((s.end_date as string) + '+05:30').getTime() : 0
    return endMs > nowMs
  })
  if (active.length === 0) return []

  const planIds = active.map(s => s.plan_id)
  const { data: links } = await supabase
    .from('plan_libraries')
    .select('plan_id')
    .in('plan_id', planIds)
    .eq('library_id', libraryId)

  const coveredPlanIds = new Set((links as any[] ?? []).map(l => l.plan_id))
  const eligible = active.filter(s => coveredPlanIds.has(s.plan_id))
  if (eligible.length === 0) return []

  const { data: plans } = await supabase
    .from('plans')
    .select('id, name, time_window_start, time_window_end, days_of_week')
    .in('id', eligible.map(s => s.plan_id))

  const planById = new Map((plans as any[] ?? []).map(p => [p.id, p]))

  return eligible.map((s): EligibleSubscription => {
    const plan = planById.get(s.plan_id)
    return {
      id:              s.id,
      planName:        plan?.name ?? 'Membership plan',
      endDate:         s.end_date,
      timeWindowStart: plan?.time_window_start ?? null,
      timeWindowEnd:   plan?.time_window_end ?? null,
      daysOfWeek:      (plan as any)?.days_of_week ?? null,
    }
  })
}
