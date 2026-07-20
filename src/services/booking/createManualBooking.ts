// src/services/booking/createManualBooking.ts
/**
 * Shared manual walk-in booking logic.
 *
 * Previously implemented three times, independently:
 *   - owner.ts's manualBookSeat
 *   - staff-seat-actions.ts's seniorManualBook (its own comment even said
 *     "mirrors ManualBookInput from owner.ts")
 *   - staff.ts's staffWalkIn (found later, during the bookings repository
 *     survey — this copy was MISSING the slot-window validation the other
 *     two had, and never persisted payment_mode/payment_note at all)
 *
 * All three did the same seat check, overlap check, booking insert,
 * exclusion-violation handling, and payment insert — with different copy
 * for authorization only. Consolidated per architecture audit, Phase 3 /
 * Priority 1.1 (plus the staffWalkIn fix during Phase 6): one place owns
 * the booking mechanics, so a future fix (pricing rule, validation change,
 * new field) can't land in some role's path and not another's.
 *
 * Authorization stays with the caller (owner.ts checks libraries.owner_id,
 * staff-seat-actions.ts checks the staff table for senior_staff) — that's
 * genuinely role-specific and correctly stays out of this shared function.
 * Callers must verify authorization BEFORE calling this.
 *
 * payment_mode / payment_note are persisted to the payments row (added via
 * migration 20260709120000_add_payment_mode_note.sql) — previously both
 * fields were collected from the UI and silently dropped, only appearing in
 * the server log line, which this consolidation surfaced.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { validateISTRange } from '@/lib/ist'
import { fetchActiveSlotConfigs } from '@/lib/booking/slotConfigService'
import { validateBooking } from '@/lib/booking/slotBoundaryValidation'
import { log, logError } from '@/lib/logger'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import type { Database } from '@/lib/supabase/types'
import { getSeatById } from '@/repositories/seats.repository'

type TypedSupabaseClient = SupabaseClient<Database>

export type ManualBookingInput = {
  seatId:      string
  libraryId:   string
  userName:    string
  userPhone:   string
  startTime:   string
  endTime:     string
  bookingMode: 'online' | 'offline'
  amountPaid:  number
  paymentMode: 'cash' | 'upi' | 'other'
  paymentNote: string
}

/**
 * actorTag identifies who's booking, for log lines only (was 'manualBookSeat'
 * vs 'seniorManualBook' before) — keeps existing log greppability per role.
 */
export async function createManualBooking(
  supabase: TypedSupabaseClient,
  input: ManualBookingInput,
  actorTag: 'manualBookSeat' | 'seniorManualBook' | 'staffWalkIn',
): Promise<ActionResult<{ bookingId: string }>> {
  const { seatId, libraryId, userName, userPhone, startTime, endTime, bookingMode, amountPaid, paymentMode, paymentNote } = input

  if (!startTime || !endTime) return { success: false, error: 'Start and end time are required' }
  const rangeCheck = validateISTRange(startTime, endTime, 24)
  if (rangeCheck.ok === false) {
    return { success: false, error: rangeCheck.error }
  }

  // SLOT-ONLY ARCHITECTURE: the booking must fit entirely inside one active
  // slot — same check used by student.initiateBooking. Owners/staff can
  // still record a free-form `amountPaid` for walk-ins, but the BOOKING
  // WINDOW itself must be valid per slot_configs.
  const slots = await fetchActiveSlotConfigs(supabase, libraryId)
  const windowCheck = validateBooking({ slots, startTime, endTime, graceMinutes: 5 })
  if (windowCheck.ok === false) return { success: false, error: windowCheck.error }

  const seat = await getSeatById(supabase, seatId)

  if (!seat || seat.library_id !== libraryId) return { success: false, error: 'Seat not found in this library' }
  if (!seat.is_active) return { success: false, error: 'Seat is inactive — activate it first' }

  const { data: overlap } = await supabase
    .from('bookings')
    .select('id, start_time, end_time')
    .eq('seat_id', seatId)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])
    .lt('start_time', endTime)
    .gt('end_time', startTime)

  if (overlap && overlap.length > 0)
    return { success: false, error: 'Seat already has an active booking in this time slot' }

  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      user_id:      null,
      library_id:   libraryId,
      seat_id:      seatId,
      start_time:   startTime,
      end_time:     endTime,
      status:       'confirmed' as never,
      guest_name:   userName.trim(),
      guest_phone:  userPhone.trim(),
      booking_mode: bookingMode,
    } as never)
    .select('id')
    .single()

  if (bookErr || !booking) {
    // PostgreSQL error 23P01 = exclusion_violation, raised by the
    // no_overlapping_bookings EXCLUDE constraint. This is the hard backstop
    // against double-booking — it can fire here if a student's online
    // booking and an owner/staff walk-in booking for the same seat/time race
    // each other. Without this check the caller would see a raw Postgres
    // error message instead of a clear "already booked" message.
    if ((bookErr as any)?.code === '23P01') {
      logError(actorTag, `Exclusion violation — seat ${seatId} booked concurrently`, bookErr)
      return { success: false, error: 'This seat was just booked by someone else. Please refresh and choose another seat.' }
    }
    logError(actorTag, 'Insert failed', bookErr)
    return { success: false, error: bookErr?.message ?? 'Failed to create booking' }
  }

  if (amountPaid > 0) {
    const { error: payErr } = await supabase
      .from('payments')
      .insert({
        user_id:      null,
        booking_id:   (booking as any).id,
        amount:       amountPaid,
        status:       'paid' as never,
        payment_mode: paymentMode,
        payment_note: paymentNote || null,
      } as never)

    if (payErr)
      logError(actorTag, `Payment insert failed for booking=${(booking as any).id}`, payErr)
  }

  log(actorTag, `booking=${(booking as any).id} seat=${seatId} guest=${userName} mode=${bookingMode} amount=${amountPaid} pay=${paymentMode} note="${paymentNote}"`)

  // Both owner and staff dashboards must see the booking regardless of who
  // created it — revalidating all four paths every time (harmless/idempotent)
  // instead of the two role-specific subsets each copy used to revalidate.
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')

  return { success: true, data: { bookingId: (booking as any).id } }
}
