/**
 * Currency: 10000 → "₹10k", 150000 → "₹1.5L"
 */
export function fmtCurrency(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(1)}k`
  return `₹${n.toLocaleString('en-IN')}`
}

/**
 * ISO / IST string → "09:30 AM"
 */
export function fmtTime(raw: string): string {
  // Works for both ISO timestamps and plain "HH:MM:SS" IST strings
  const d = raw.includes('T') ? new Date(raw) : new Date(`1970-01-01T${raw}`)
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

/**
 * Returns hour (0-23) from an IST DB string like "09:30:00" or ISO
 */
export function getISTHour(raw: string): number {
  return parseInt(raw.slice(0, 2), 10)
}

/**
 * Arrow + percent string comparing two values
 */
export function pctDelta(now: number, prev: number): string {
  if (!prev) return now > 0 ? '+100%' : '—'
  const d = Math.round(((now - prev) / prev) * 100)
  return (d >= 0 ? '↑ ' : '↓ ') + Math.abs(d) + '%'
}

export function deltaColor(now: number, prev: number, accent = '#0D7C54'): string {
  return now >= prev ? accent : '#C5282C'
}

/**
 * IST-localised date string: "Monday, 12 May 2025"
 */
export function fmtISTDate(date = new Date()): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}




/**
 * Build a Postgres-compatible IST timestamp string (no timezone suffix).
 * date: a JS Date whose Y/M/D you want, treated as IST calendar day.
 * hour, minute: IST time to set.
 * Output: "YYYY-MM-DD HH:MM:00"
 */
export function buildISTTimestamp(date: Date, hour: number, minute = 0): string {
  const y  = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d  = String(date.getDate()).padStart(2,  '0')
  const h  = String(hour).padStart(2,   '0')
  const m  = String(minute).padStart(2, '0')
  return `${y}-${mo}-${d} ${h}:${m}:00`
}


/**
 * "HH:MM:SS" or ISO → "6 AM – 10 PM" style open hours string
 * Reuses your existing fmtTime().
 */
export function fmtOpenHours(openRaw: string, closeRaw: string): string {
  return `${fmtTime(openRaw)} – ${fmtTime(closeRaw)}`
}

/**
 * Is a library open right now (IST)?
 * Accepts "HH:MM:SS" strings from Postgres time column.
 * Uses millisecond comparison — no date-fns, no moment.
 */
export function isOpenNow(openRaw: string, closeRaw: string): boolean {
  // Get current IST time-of-day in milliseconds since midnight
  const nowMs = nowISTMs()
  const openMs  = timeStringToMs(openRaw)
  const closeMs = timeStringToMs(closeRaw)
  return nowMs >= openMs && nowMs < closeMs
}

/**
 * Current IST time-of-day in milliseconds since midnight.
 * e.g. 9:30 AM IST → 34200000
 */
export function nowISTMs(): number {
  const now = new Date()
  // Convert to IST by adding UTC+5:30 offset (19800000 ms) to UTC ms,
  // then mod by 86400000 to get ms since midnight IST.
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const istMs = utcMs + 19_800_000 // UTC+5:30 = 5.5 * 3600000
  return istMs % 86_400_000
}

/**
 * "HH:MM:SS" → milliseconds since midnight.
 * Works for both "09:30:00" and "09:30".
 */
export function timeStringToMs(raw: string): number {
  const [h, m, s] = raw.split(':').map(Number)
  return (h * 3600 + (m || 0) * 60 + (s || 0)) * 1000
}

/**
 * Build a Postgres-compatible IST timestamp string.
 * Stores as plain IST wall-clock — no timezone suffix.
 * Output: "YYYY-MM-DD HH:MM:00"
 *
 * @param dateMs  - JS Date .getTime() for the calendar date (Y/M/D treated as local IST)
 * @param hour    - IST hour (0-23)
 * @param minute  - IST minute (default 0)
 */


/**
 * Parse a date string "YYYY-MM-DD" into a JS Date at midnight local time.
 */
export function parseDateStr(dateStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d)
}

/**
 * Booking slot definitions — single source of truth for all roles.
 * Owner slot config, staff check-in, and student booking all use this array.
 */
export const BOOKING_SLOTS = [
  { label: '6–9 AM',   startH: 6,  endH: 9  },
  { label: '9 AM–12',  startH: 9,  endH: 12 },
  { label: '12–3 PM',  startH: 12, endH: 15 },
  { label: '3–6 PM',   startH: 15, endH: 18 },
  { label: '6–9 PM',   startH: 18, endH: 21 },
  { label: '9–10 PM',  startH: 21, endH: 22 },
] as const

export type BookingSlot = typeof BOOKING_SLOTS[number]

/**
 * Short date: "Mon, 12 May 2025" in IST
 */
export function fmtISTDateShort(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/** Duration in hours between two IST timestamp strings */
export function durationHours(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000
}

/** Milliseconds until a future IST timestamp string */
export function msUntil(istTimestamp: string): number {
  return Math.max(0, new Date(istTimestamp).getTime() - Date.now())
}

/** Format seconds as "M:SS" countdown */
export function fmtCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}