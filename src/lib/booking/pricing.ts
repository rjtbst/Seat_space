// src/lib/booking/pricing.ts
/**
 * Single source of truth for booking pricing — SLOT-ONLY ARCHITECTURE.
 *
 * RULE (per product spec):
 *   Use the slot whose [start, end) range contains the booking's START TIME
 *   on the corresponding day of week. Use that slot's effective rate
 *   (price - discount) as the ₹/hour rate for the ENTIRE booking — never
 *   split or average across multiple slots.
 *
 * BREAKING CHANGE (slot-only architecture):
 *   There is NO base_price fallback. If no active slot matches the booking's
 *   start time, pricing CANNOT be resolved and the booking MUST be rejected
 *   by validation (see slotBoundaryValidation.ts) before this module is ever
 *   called for that booking. resolveHourlyRate/calculateBookingAmount throw
 *   if called with a start time that matches no slot — this is treated as a
 *   programming error (validation should have caught it first), not a normal
 *   "fall back to standard rate" case.
 *
 * Used identically by:
 *  - price preview UI            (getBookingPricePreview)
 *  - student.initiateBooking
 *  - owner.manualBookSeat         (suggested price)
 *  - staff.seniorManualBook        (suggested price)
 *  - booking confirmation         (re-validated server-side, never trusts client amount)
 *  - library cards / library detail (slotToDisplayOption shows the exact
 *    per-slot rate — there is no single "card price" anymore, since price
 *    now varies by time of day)
 */

import { getISTDayIndex, getISTMinutesOfDay } from '../ist'
import { type SlotConfig, effectiveSlotRate, timeToMinutes } from './types'

export type PriceResolution = {
  /** ₹ per hour to apply for the entire booking */
  hourlyRate: number
  /** The slot that determined the rate — never null in slot-only architecture */
  matchedSlot: SlotConfig
}

export class NoMatchingSlotError extends Error {
  constructor() {
    super('No active slot covers this booking start time — pricing cannot be resolved. Validation should have rejected this booking before pricing was attempted.')
    this.name = 'NoMatchingSlotError'
  }
}

/**
 * Resolves the ₹/hour rate for a booking starting at `startTime` (a plain
 * IST DB string, "YYYY-MM-DDTHH:mm:ss").
 *
 * `slots` should be ALL slot configs for the library (active and inactive
 * are both fine to pass — inactive ones are filtered out here).
 *
 * Throws NoMatchingSlotError if no active slot covers `startTime`. Callers
 * MUST run slotBoundaryValidation first so this never happens in practice.
 */
export function resolveHourlyRate(
  slots:     SlotConfig[],
  startTime: string,
): PriceResolution {
  const dayIdx    = getISTDayIndex(startTime)
  const startMins = getISTMinutesOfDay(startTime)

  const candidates = slots.filter(s =>
    s.is_active &&
    s.days.includes(dayIdx) &&
    timeToMinutes(s.start) <= startMins &&
    startMins < timeToMinutes(s.end),
  )

  if (candidates.length === 0) {
    throw new NoMatchingSlotError()
  }

  // slotValidation.ts guarantees active slots never overlap on the same day,
  // so there should only ever be one candidate. If — due to legacy data or a
  // validation bypass — more than one matches, pick the lowest effective
  // rate deterministically rather than guessing.
  const slot = [...candidates].sort((a, b) => effectiveSlotRate(a) - effectiveSlotRate(b))[0]

  return { hourlyRate: effectiveSlotRate(slot), matchedSlot: slot }
}

/**
 * Computes the final ₹ amount for a booking. Duration is derived from
 * startTime/endTime (plain IST DB strings). Rounds UP to the nearest rupee.
 *
 * Throws NoMatchingSlotError if no active slot covers `startTime` — see
 * resolveHourlyRate.
 */
export function calculateBookingAmount(
  slots:     SlotConfig[],
  startTime: string,
  endTime:   string,
): { amount: number } & PriceResolution {
  const durationHours =
    (new Date(endTime + '+05:30').getTime() - new Date(startTime + '+05:30').getTime()) / 3_600_000

  const resolution = resolveHourlyRate(slots, startTime)
  const amount     = Math.ceil(Math.max(0, durationHours) * resolution.hourlyRate)

  return { amount, ...resolution }
}