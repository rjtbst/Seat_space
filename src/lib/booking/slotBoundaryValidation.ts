// src/lib/booking/slotBoundaryValidation.ts
/**
 * SLOT-ONLY ARCHITECTURE — replaces bookingValidation.ts's
 * validateOperatingHours (which read libraries.open_time/close_time).
 *
 * Per spec (Phase D, requirement #7):
 *   A booking must fit ENTIRELY inside a single active slot's
 *   [start, end) window on the corresponding day of week. The booking's
 *   start AND end must both fall within the same slot — no partial overlaps,
 *   no spanning multiple slots, no booking outside all slots.
 *
 * This is now the ONLY "is this booking allowed at this time" check —
 * it subsumes what used to be "operating hours" (a library's operating
 * hours ARE the union of its active slot windows).
 *
 * Used identically by:
 *  - student.initiateBooking
 *  - owner.manualBookSeat
 *  - staff.seniorManualBook
 *  - extendBooking (the EXTENDED range must still fit inside the
 *    booking's original slot)
 */

import { getISTDayIndex, getISTMinutesOfDay, getISTDateKey } from '../ist'
import { type SlotConfig, timeToMinutes } from './types'

export type ValidationResult = { ok: true } | { ok: false; error: string }

/**
 * Returns the active slot that fully contains [startTime, endTime) on the
 * corresponding day of week, or null if none does.
 *
 * Only single-day bookings are supported — if start and end fall on
 * different IST calendar dates, no slot can contain the range (a slot's
 * start/end are both times-of-day, not spanning midnight), so this returns
 * null and the caller's error message explains why.
 */
export function findContainingSlot(
  slots:     SlotConfig[],
  startTime: string,
  endTime:   string,
): SlotConfig | null {
  if (getISTDateKey(startTime) !== getISTDateKey(endTime)) return null

  const dayIdx    = getISTDayIndex(startTime)
  const startMins = getISTMinutesOfDay(startTime)
  const endMins   = getISTMinutesOfDay(endTime)

  return slots.find(s =>
    s.is_active &&
    s.days.includes(dayIdx) &&
    timeToMinutes(s.start) <= startMins &&
    endMins <= timeToMinutes(s.end),
  ) ?? null
}

/**
 * Validates that [startTime, endTime) fits entirely inside ONE active slot.
 *
 * Returns a descriptive error distinguishing "no slot covers this time at
 * all" from "a slot covers the start but the booking runs past its end" —
 * both map to user-facing messages the booking UI can show directly.
 */
export function validateSlotBoundary(
  slots:     SlotConfig[],
  startTime: string,
  endTime:   string,
): ValidationResult {
  if (getISTDateKey(startTime) !== getISTDateKey(endTime)) {
    return { ok: false, error: 'Bookings cannot span across midnight — please book within a single day' }
  }

  const dayIdx    = getISTDayIndex(startTime)
  const startMins = getISTMinutesOfDay(startTime)
  const endMins   = getISTMinutesOfDay(endTime)

  const active = slots.filter(s => s.is_active && s.days.includes(dayIdx))

  if (active.length === 0) {
    return { ok: false, error: 'This library has no available time slots for this day' }
  }

  // Slot whose window contains the start time (regardless of whether it also
  // covers the end time) — used to give a precise "exceeds slot end" message.
  const startingSlot = active.find(s =>
    timeToMinutes(s.start) <= startMins && startMins < timeToMinutes(s.end),
  )

  if (!startingSlot) {
    return { ok: false, error: 'Selected start time falls outside all available slots for this day' }
  }

  if (endMins > timeToMinutes(startingSlot.end)) {
    return {
      ok: false,
      error: `Booking must end by ${startingSlot.end} to stay within the selected slot (${startingSlot.start}–${startingSlot.end})`,
    }
  }

  return { ok: true }
}

/**
 * Past-time check — unchanged from bookingValidation.ts, kept here so all
 * slot-only booking validation lives in one module.
 */
export function validateStartNotInPast(
  startTime:    string,
  graceMinutes = 0,
): ValidationResult {
  const startMs = new Date(startTime + '+05:30').getTime()
  if (isNaN(startMs)) return { ok: false, error: 'Invalid start time' }

  if (startMs < Date.now() - graceMinutes * 60_000) {
    return { ok: false, error: 'Booking start time cannot be in the past' }
  }
  return { ok: true }
}

/**
 * Combined entry-point used by all booking-creation/extension flows.
 * Runs the past-time check, then the slot-boundary check.
 */
export function validateBooking(params: {
  slots:         SlotConfig[]
  startTime:     string
  endTime:       string
  graceMinutes?: number
}): ValidationResult {
  const pastCheck = validateStartNotInPast(params.startTime, params.graceMinutes ?? 0)
  if (pastCheck.ok === false) return pastCheck

  return validateSlotBoundary(params.slots, params.startTime, params.endTime)
}