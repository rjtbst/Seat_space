/**
 * lib/ist.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for IST (Asia/Kolkata, UTC+5:30) time utilities.
 * Import from here — never write timezone logic inline elsewhere.
 *
 * STORAGE CONVENTION
 * ──────────────────
 * • DB column type : timestamp WITHOUT time zone
 * • Stored values  : plain IST wall-clock strings — "2024-01-15T14:30:00"
 * • No UTC, no Z suffix, no offset in stored or transmitted values.
 *
 * CLIENT INPUTS
 * ─────────────
 * • datetime-local inputs are labeled IST and sent to server as-is.
 * • Use inputToDB() to ensure the seconds component is present before saving.
 *
 * DISPLAY
 * ───────
 * • Always append '+05:30' when constructing a Date for display so the
 *   browser's local timezone never interferes — works on any machine.
 */

export const IST_TZ    = 'Asia/Kolkata'
const        OFFSET_MS = 5.5 * 60 * 60 * 1000  // 330 min in ms

// ─── Server-safe helpers ──────────────────────────────────────────────────────
// (no browser APIs — safe in server components, actions, and API routes)

/**
 * Current IST wall-clock as a plain ISO string.
 * e.g. "2024-01-15T14:30:00.000"
 */
export function nowIST(): string {
  return new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 23)
}

/** Today in IST: midnight → 23:59:59.999 as plain strings. */
export function todayRangeIST(): { start: string; end: string } {
  const ist = new Date(Date.now() + OFFSET_MS)
  return _dayRange(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
}

/** Yesterday in IST as plain strings. */
export function yesterdayRangeIST(): { start: string; end: string } {
  const ist = new Date(Date.now() + OFFSET_MS - 86_400_000)
  return _dayRange(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
}

/** Current IST calendar month: 1st 00:00:00 → last-day 23:59:59.999. */
export function monthRangeIST(): { start: string; end: string } {
  const ist  = new Date(Date.now() + OFFSET_MS)
  const y    = ist.getUTCFullYear()
  const mo   = ist.getUTCMonth()
  // day-0 trick: Date.UTC(y, mo+1, 0) is the last day of month `mo`
  const last = new Date(Date.UTC(y, mo + 1, 0) + OFFSET_MS)
  return {
    start: _pad(y, mo, 1) + 'T00:00:00',
    end  : _pad(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()) + 'T23:59:59.999',
  }
}

/**
 * Plain IST start of a window N months in the past.
 * Useful for revenue / analytics queries.
 * e.g. pastMonthsStartIST(6) → "2023-07-01T00:00:00"
 */
export function pastMonthsStartIST(n: number): string {
  const ist = new Date(Date.now() + OFFSET_MS)
  // Date.UTC handles month underflow automatically (e.g. month -2 → Oct prev year)
  const past = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - n, 1) + OFFSET_MS)
  return _pad(past.getUTCFullYear(), past.getUTCMonth(), 1) + 'T00:00:00'
}

/**
 * Extract IST hour (0–23) from a plain IST DB string.
 * e.g. "2024-01-15T14:30:00" → 14
 */
export function getISTHour(dbTimestamp: string): number {
  return parseInt(dbTimestamp.split('T')[1]?.split(':')[0] ?? '0', 10)
}

/**
 * Extract minutes-since-midnight (IST) from a plain IST DB string.
 * e.g. "2024-01-15T14:30:00" → 870  (14*60 + 30)
 * Used by the slot-pricing/operating-hours modules to compare against
 * Postgres `time` columns and slot start/end times.
 */
export function getISTMinutesOfDay(dbTimestamp: string): number {
  const [hh, mm] = (dbTimestamp.split('T')[1] ?? '0:0').split(':')
  return (parseInt(hh ?? '0', 10) * 60) + parseInt(mm ?? '0', 10)
}

/**
 * The IST calendar date portion of a plain IST DB string.
 * e.g. "2024-01-15T14:30:00" → "2024-01-15"
 * Used to check whether a booking's start and end fall on the same day.
 */
export function getISTDateKey(dbTimestamp: string): string {
  return dbTimestamp.split('T')[0] ?? ''
}

/**
 * Day-of-week index for a plain IST DB string, using the
 * Mon=0 .. Sun=6 convention used by slot_configs.days.
 * e.g. "2024-01-15T14:30:00" (a Monday) → 0
 *
 * Computed purely from the calendar date (Y-M-D) using Date.UTC, so it is
 * independent of the server's runtime timezone — no IST offset arithmetic
 * needed since we already have the IST calendar date as a string.
 */
export function getISTDayIndex(dbTimestamp: string): number {
  const [y, m, d] = getISTDateKey(dbTimestamp).split('-').map(Number)
  const jsDay = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() // 0=Sun..6=Sat
  return jsDay === 0 ? 6 : jsDay - 1 // remap to 0=Mon..6=Sun
}

// ─── Client-safe helpers ──────────────────────────────────────────────────────

/**
 * Convert a JS Date to the "YYYY-MM-DDTHH:mm" string a datetime-local input
 * expects, expressed in IST regardless of browser locale.
 * Use for setting default/initial input values.
 */
export function toISTInputValue(date: Date): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 16)
}

/**
 * Convert a datetime-local input value ("YYYY-MM-DDTHH:mm") to a DB-ready
 * IST string with seconds ("YYYY-MM-DDTHH:mm:00").
 * No timezone conversion — the value is already IST.
 */
export function inputToDB(val: string): string {
  if (!val) return ''
  return val.length === 16 ? val + ':00' : val
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Format a plain IST DB timestamp as full date + time.
 * e.g. "2024-01-15T14:30:00" → "15 Jan 2024, 02:30 PM"
 */
export function fmtIST(dbTimestamp: string): string {
  if (!dbTimestamp) return '—'
  return new Date(dbTimestamp + '+05:30').toLocaleString('en-IN', {
    timeZone : IST_TZ,
    day      : '2-digit',
    month    : 'short',
    year     : 'numeric',
    hour     : '2-digit',
    minute   : '2-digit',
    hour12   : true,
  })
}

/**
 * Format just the time portion of a plain IST DB timestamp.
 * e.g. "2024-01-15T14:30:00" → "02:30 PM"
 */
export function fmtISTTime(dbTimestamp: string): string {
  if (!dbTimestamp) return '—'
  return new Date(dbTimestamp + '+05:30').toLocaleTimeString('en-IN', {
    timeZone : IST_TZ,
    hour     : '2-digit',
    minute   : '2-digit',
    hour12   : true,
  })
}

/**
 * Format a datetime-local input value ("YYYY-MM-DDTHH:mm") as human-readable
 * IST text. Used for booking summary previews in the UI.
 * e.g. "2024-01-15T14:30" → "15 Jan 2024, 2:30 PM"
 */
export function fmtInputPreview(val: string): string {
  if (!val) return '—'
  const [datePart, timePart] = val.split('T')
  if (!datePart || !timePart) return '—'
  const [y, m, d] = datePart.split('-')
  const [hh, mm]  = timePart.split(':').map(Number)
  const ampm      = hh >= 12 ? 'PM' : 'AM'
  const h12       = hh % 12 === 0 ? 12 : hh % 12
  const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${MONTHS[Number(m) - 1]} ${y}, ${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

/**
 * Validate that a start/end pair of plain IST DB strings form a valid range.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function validateISTRange(
  start    : string,
  end      : string,
  maxHours = 24,
): { ok: true } | { ok: false; error: string } {
  const startMs = new Date(start + '+05:30').getTime()
  const endMs   = new Date(end   + '+05:30').getTime()
  if (isNaN(startMs) || isNaN(endMs))
    return { ok: false, error: 'Invalid time format' }
  if (endMs <= startMs)
    return { ok: false, error: 'End time must be after start time' }
  if (endMs - startMs > maxHours * 3_600_000)
    return { ok: false, error: `Booking cannot exceed ${maxHours} hours` }
  return { ok: true }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _dayRange(y: number, mo: number, d: number): { start: string; end: string } {
  const prefix = _pad(y, mo, d)
  return { start: prefix + 'T00:00:00', end: prefix + 'T23:59:59.999' }
}

function _pad(y: number, mo: number, d: number): string {
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}