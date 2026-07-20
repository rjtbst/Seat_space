// src/lib/booking/libraryStatus.ts
/**
 * SLOT-ONLY ARCHITECTURE — single source of truth for a library's
 * open/closed status and "operating hours" display text.
 *
 * Replaces every previous reader of libraries.open_time/close_time:
 *  - LibraryCard.tsx's local isOpenNow()
 *  - student.ts's isOpenNowIST()
 *  - LibraryDetailClient's openHours computation
 *
 * RULE (Phase B / spec #6):
 *   A library is OPEN right now iff at least one of its active slots:
 *     - includes today's day-of-week, AND
 *     - has start <= now < end (in IST)
 *   Otherwise CLOSED.
 *
 * "Operating hours" for display purposes is the union of all of today's
 * active slot windows, shown as a list of ranges (e.g. "9 AM–1 PM, 2 PM–6 PM")
 * rather than a single open/close pair — a library can have gaps between
 * slots (e.g. closed for lunch), and those gaps are real "closed" periods.
 */

import { getISTDayIndex, getISTMinutesOfDay, nowIST } from '../ist'
import { type SlotConfig, formatTime12h, timeToMinutes } from './types'

export type LibraryStatus = {
  isOpen: boolean
  /** Today's active slot windows, sorted and merged, formatted "9:00 AM–1:00 PM" */
  todayHoursLabel: string
  /** The slot currently open, if isOpen is true */
  currentSlot: SlotConfig | null
}

/**
 * Computes open/closed status "right now" (server clock, IST) from a
 * library's full slot list (active + inactive — inactive are filtered here).
 */
export function resolveLibraryStatus(slots: SlotConfig[]): LibraryStatus {
  const now       = nowIST()
  const dayIdx    = getISTDayIndex(now)
  const nowMins   = getISTMinutesOfDay(now)

  const todaySlots = slots
    .filter(s => s.is_active && s.days.includes(dayIdx))
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))

  const currentSlot = todaySlots.find(s =>
    timeToMinutes(s.start) <= nowMins && nowMins < timeToMinutes(s.end),
  ) ?? null

  return {
    isOpen:          currentSlot !== null,
    todayHoursLabel: formatTodayHours(todaySlots),
    currentSlot,
  }
}

/**
 * Merges and formats a day's active slots into a human-readable hours
 * string. Adjacent/overlapping slots are merged into a single range so
 * "9–12 ₹40" and "12–6 ₹60" display as "9:00 AM–6:00 PM", while a genuine
 * gap (e.g. "9–12" and "2–6") displays as "9:00 AM–12:00 PM, 2:00 PM–6:00 PM".
 */
export function formatTodayHours(todaySlotsSorted: SlotConfig[]): string {
  if (todaySlotsSorted.length === 0) return 'Closed today'

  const merged: { start: number; end: number }[] = []
  for (const slot of todaySlotsSorted) {
    const start = timeToMinutes(slot.start)
    const end   = timeToMinutes(slot.end)
    const last  = merged[merged.length - 1]
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end)
    } else {
      merged.push({ start, end })
    }
  }

  return merged
    .map(({ start, end }) => `${formatTime12h(minutesToTimeStr(start))}–${formatTime12h(minutesToTimeStr(end))}`)
    .join(', ')
}

function minutesToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}