// src/lib/booking/slotValidation.ts
/**
 * Centralized slot-configuration validation.
 *
 * Used by:
 *  - upsertSlotConfig  (lib/actions/owner.ts)
 *  - toggleSlotConfig  (lib/actions/owner.ts)
 *
 * Any future "staff can edit slots" flow MUST go through this module too —
 * do not re-implement these checks.
 */

import { type SlotConfig, type SlotConfigInput, timeToMinutes } from './types'

export type ValidationResult = { ok: true } | { ok: false; error: string }

/* ─── Basic shape checks ─────────────────────────────────────────────────── */

export function validateSlotShape(slot: SlotConfigInput): ValidationResult {
  if (!slot.start || !slot.end)
    return { ok: false, error: 'Start and end time are required' }

  if (!/^\d{2}:\d{2}$/.test(slot.start) || !/^\d{2}:\d{2}$/.test(slot.end))
    return { ok: false, error: 'Invalid slot range' }

  if (!slot.days || slot.days.length === 0)
    return { ok: false, error: 'Select at least one day' }

  if (slot.days.some(d => d < 0 || d > 6 || !Number.isInteger(d)))
    return { ok: false, error: 'Invalid slot range' }

  const startMin = timeToMinutes(slot.start)
  const endMin   = timeToMinutes(slot.end)

  if (startMin >= endMin)
    return { ok: false, error: 'Start time must be before end time' }

  if (slot.price == null || isNaN(slot.price) || slot.price < 0)
    return { ok: false, error: 'Enter a valid price' }

  if (slot.discount == null || isNaN(slot.discount) || slot.discount < 0)
    return { ok: false, error: 'Discount must be a positive amount' }

  if (slot.discount > slot.price)
    return { ok: false, error: 'Discount cannot exceed the slot price' }

  return { ok: true }
}

/* ─── Duplicate / overlap detection ──────────────────────────────────────── */

/**
 * Checks `candidate` against every OTHER active slot already configured for
 * the same library (`existing` should exclude the candidate itself when
 * editing). Two slots conflict if they share at least one active day AND
 * their [start, end) ranges overlap — this covers:
 *
 *  - Exact duplicates       (09:00–11:00 vs 09:00–11:00)
 *  - Partial overlaps       (09:00–11:00 vs 10:00–12:00)
 *  - Ambiguous pricing       (any overlap means two prices could apply to the
 *                             same period, regardless of whether the prices
 *                             happen to match)
 *
 * Inactive slots are ignored — they don't affect pricing, so they can't
 * create ambiguity. When *re-activating* a slot, pass `includeInactive: true`
 * so the slot being re-activated is checked against everything else.
 */
export function findSlotConflict(
  candidate: SlotConfigInput,
  existing:  SlotConfig[],
): ValidationResult {
  const candStart = timeToMinutes(candidate.start)
  const candEnd   = timeToMinutes(candidate.end)

  for (const other of existing) {
    if (candidate.id && other.id === candidate.id) continue
    if (!other.is_active) continue

    const sharesDay = other.days.some(d => candidate.days.includes(d))
    if (!sharesDay) continue

    const otherStart = timeToMinutes(other.start)
    const otherEnd   = timeToMinutes(other.end)

    const overlaps = candStart < otherEnd && otherStart < candEnd
    if (!overlaps) continue

    if (candStart === otherStart && candEnd === otherEnd) {
      return { ok: false, error: `Slot already exists (${other.start}–${other.end})` }
    }
    return { ok: false, error: `Slot overlaps an existing configuration (${other.start}–${other.end})` }
  }

  return { ok: true }
}

/**
 * Full validation pipeline for creating/updating a slot:
 * shape checks, then conflict detection against the library's other
 * active slots.
 */
export function validateSlot(
  candidate: SlotConfigInput,
  existingSlots: SlotConfig[],
): ValidationResult {
  const shape = validateSlotShape(candidate)
  if (shape.ok === false) return shape

  // Only check conflicts if this slot will be active — an inactive slot
  // can be saved in any shape without colliding with live pricing.
  if (candidate.is_active) {
    return findSlotConflict(candidate, existingSlots)
  }
  return { ok: true }
}