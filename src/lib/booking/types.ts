// src/lib/booking/types.ts
/**
 * Single source of truth for slot-configuration types.
 *
 * Replaces the THREE independent copies that used to exist:
 *   - SlotConfig in lib/actions/owner.ts            (read/wrote libraries.description JSON)
 *   - SlotConfig in lib/actions/staff-seat-actions.ts (duplicated, also JSON)
 *   - OwnerSlot  in lib/libraryMeta.ts               (student-facing, also JSON)
 *
 * Slots now live in the `slot_configs` table (see supabase/migrations).
 *
 * DAYS CONVENTION
 * ────────────────
 * `days` is stored as smallint[] in Postgres and comes back as number[].
 * Index convention: 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri, 5 = Sat, 6 = Sun
 * — this matches the DAYS array already used by SlotConfigClient's UI, so
 * the owner form's `form.days: number[]` maps 1:1 onto the DB column with
 * zero conversion logic.
 *
 * PRICE / DISCOUNT CONVENTION
 * ───────────────────────────
 * `price`    — ₹ per hour for this slot (the per-slot rate; there is no
 *              library-wide base_price anymore — see lib/booking/pricing.ts)
 * `discount` — flat ₹ reduction applied to `price` to get the effective
 *              hourly rate for this slot: effectiveRate = max(0, price - discount)
 *
 * (Previously lib/libraryMeta.ts treated `discount` as a PERCENTAGE while
 * SlotConfigClient's UI labelled it "₹ last-minute discount" — a real bug.
 * This is now standardised to a flat ₹ amount everywhere.)
 */

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type SlotConfig = {
  id:         string
  library_id: string
  start:      string     // "HH:MM" (24h)
  end:        string     // "HH:MM" (24h)
  days:       number[]   // 0=Mon .. 6=Sun, e.g. [0,1,2,3,4]
  price:      number      // ₹ / hour
  discount:   number      // flat ₹ reduction, default 0
  is_active:  boolean
}

/** Input shape for creating/updating a slot — id and library_id are supplied separately. */
export type SlotConfigInput = {
  id?:       string
  start:     string
  end:       string
  days:      number[]
  price:     number
  discount:  number
  is_active: boolean
}

/**
 * Human-readable, range-compressed day label for display.
 * e.g. [0,1,2,3,4] -> "Mon–Fri",  [0,1,2,3,4,5,6] -> "Mon–Sun",  [0,2,4] -> "Mon, Wed, Fri"
 */
export function daysDisplay(indices: number[]): string {
  if (!indices.length) return 'No days'
  if (indices.length === 7) return 'Mon–Sun'
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const groups: number[][] = []
  let group: number[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) group.push(sorted[i])
    else { groups.push(group); group = [sorted[i]] }
  }
  groups.push(group)
  return groups
    .map(g => (g.length >= 3 ? `${DAY_LABELS[g[0]]}–${DAY_LABELS[g[g.length - 1]]}` : g.map(i => DAY_LABELS[i]).join(', ')))
    .join(', ')
}

/** Effective hourly rate after applying the slot's flat ₹ discount. Never negative. */
export function effectiveSlotRate(slot: Pick<SlotConfig, 'price' | 'discount'>): number {
  return Math.max(0, Number(slot.price ?? 0) - Number(slot.discount ?? 0))
}

/** "09:00" -> 540 (minutes since midnight). Tolerates "09:00:00". */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** "540" -> "09:00" */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ─── Student-facing display ─────────────────────────────────────────────── */

/** "9:00 AM" / "12:00 PM" — used for student-facing slot labels and operating-hours display. */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm   = h >= 12 ? 'PM' : 'AM'
  const h12    = h % 12 || 12
  const minStr = m > 0 ? `:${String(m).padStart(2, '0')}` : ':00'
  return `${h12}${minStr} ${ampm}`
}

export type SlotDisplayOption = {
  id:         string
  label:      string   // "9:00 AM – 11:30 AM"
  days:       string   // "Mon–Fri"
  basePrice:  number   // ₹/hr before discount
  discount:   number   // flat ₹ reduction
  finalPrice: number   // ₹/hr effective rate (price - discount, floor 0)
}

/**
 * Converts a SlotConfig into a display-friendly option for the student
 * library-detail page. `finalPrice` is the exact ₹/hr rate that
 * lib/booking/pricing.ts will apply to a booking starting in this slot —
 * keeping the preview and the actual charge in sync.
 *
 * Midnight end: a slot whose end is "00:00" runs until end-of-day.
 * We display this as "12:00 AM" with a "(midnight)" suffix to distinguish
 * it from a hypothetical slot that starts at midnight.
 */
export function slotToDisplayOption(slot: SlotConfig): SlotDisplayOption {
  const endMins  = timeToMinutes(slot.end)
  const endLabel = endMins === 0 ? '12:00 AM (midnight)' : formatTime12h(slot.end)
  return {
    id:         slot.id,
    label:      `${formatTime12h(slot.start)} – ${endLabel}`,
    days:       daysDisplay(slot.days),
    basePrice:  slot.price,
    discount:   slot.discount,
    finalPrice: effectiveSlotRate(slot),
  }
}