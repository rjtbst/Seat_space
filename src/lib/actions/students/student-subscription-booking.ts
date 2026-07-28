// src/lib/actions/students/student-subscription-booking.ts
'use server'

/**
 * Student server actions — booking a seat covered by an active membership
 * subscription instead of paying per-booking. Split out from
 * student-bookings.ts (which handles the paid Razorpay flow) since the
 * mechanics are genuinely different: no hold, no Razorpay round-trip, no
 * two-phase initiate/confirm — the atomic RPC either confirms the booking
 * immediately or rejects it outright. See
 * services/booking/createManualBooking.ts's own doc comment for the same
 * reasoning applied to manual walk-ins.
 */

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { inputToDB, validateISTRange } from '@/lib/ist'
import { getSeatById } from '@/repositories/seats.repository'
import { getEligibleSubscriptions, type EligibleSubscription } from '@/lib/booking/subscriptionEntitlement'
import { z } from 'zod'
import type { ActionResult } from '@/lib/actions/shared/action-result'

export type { EligibleSubscription }

/* ══════════════════════════════════════════════════════════════════════════
   GET ELIGIBLE SUBSCRIPTIONS FOR A LIBRARY (self-service)
══════════════════════════════════════════════════════════════════════════ */

export async function getEligibleSubscriptionsForLibrary(
  libraryId: string,
): Promise<EligibleSubscription[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []
  return getEligibleSubscriptions(supabase, user.id, libraryId)
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOK SEAT VIA SUBSCRIPTION
══════════════════════════════════════════════════════════════════════════ */

const bookViaSubscriptionSchema = z.object({
  subscriptionId: z.string().uuid(),
  libraryId:      z.string().uuid(),
  seatId:         z.string().uuid(),
  startTime:      z.string().min(1),
  endTime:        z.string().min(1),
})

export async function bookSeatViaSubscription(
  input: z.infer<typeof bookViaSubscriptionSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = bookViaSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Please sign in to book a seat' }

  // Same rate limit bucket as the paid flow — a subscription doesn't
  // exempt a student from the anti-spam guard on repeated booking attempts.
  const bookingLimit = await checkRateLimit(
    supabase, `booking:initiate:${user.id}`, RATE_LIMITS.BOOKING_INITIATE_PER_USER,
  )
  if (!bookingLimit.allowed) return { success: false, error: bookingLimit.message }

  const { subscriptionId, libraryId, seatId } = parsed.data
  const start = inputToDB(parsed.data.startTime)
  const end   = inputToDB(parsed.data.endTime)

  const rangeCheck = validateISTRange(start, end, 12)
  if (rangeCheck.ok === false) return { success: false, error: rangeCheck.error }

  // Cheap pre-flight seat check for a clean error message — the RPC's own
  // exclusion-violation handling is the real backstop against double-booking.
  const seat = await getSeatById(supabase, seatId)
  if (!seat || seat.library_id !== libraryId) return { success: false, error: 'Seat not found' }
  if (!seat.is_active) return { success: false, error: 'This seat is currently inactive' }

  const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
    'create_subscription_covered_booking',
    {
      p_user_id:         user.id,
      p_subscription_id: subscriptionId,
      p_library_id:      libraryId,
      p_seat_id:         seatId,
      p_start_time:      start,
      p_end_time:        end,
    },
  )

  if (rpcErr) return { success: false, error: rpcErr.message ?? 'Failed to book seat' }

  if (!rpcResult?.success) {
    const errorMessages: Record<string, string> = {
      subscription_not_found:     'Subscription not found',
      subscription_not_active:    'This subscription is not active',
      subscription_expired:       'This subscription has expired',
      plan_not_found:              'Plan not found',
      plan_not_valid_for_library:  'Your plan does not cover this library',
      seat_conflict:              'This seat was just booked by someone else. Please choose another seat.',
    }
    if (rpcResult?.error === 'outside_plan_time_window') {
      const winStart = (rpcResult.time_window_start as string | undefined)?.slice(0, 5)
      const winEnd   = (rpcResult.time_window_end as string | undefined)?.slice(0, 5)
      return {
        success: false,
        error: winStart && winEnd
          ? `Your plan only covers ${winStart}–${winEnd}. Choose a time inside that window, or book this slot as a paid seat instead.`
          : 'This booking falls outside your plan\'s allowed hours.',
      }
    }
    if (rpcResult?.error === 'outside_plan_days') {
      const days = (rpcResult.days_of_week as number[] | undefined)
      const dayNames = days?.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
      return {
        success: false,
        error: dayNames
          ? `Your plan is only valid on ${dayNames}. Book this slot as a paid seat instead, or pick a day your plan covers.`
          : 'This booking falls outside your plan\'s allowed days.',
      }
    }
    return { success: false, error: errorMessages[rpcResult?.error] ?? 'Failed to book seat' }
  }

  revalidatePath('/bookings')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/seat-manager')

  return { success: true, data: { bookingId: rpcResult.booking_id } }
}
