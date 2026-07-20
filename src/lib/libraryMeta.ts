// lib/libraryMeta.ts
/**
 * The owner dashboard stores custom slot configuration inside the
 * libraries.description column as JSON:
 *   { "slots": [{ id, start, end, days, price, discount, is_active }] }
 *
 * On the student side we must parse this rather than rendering raw JSON.
 * If description is not valid JSON we treat it as a plain text description.
 */

export type OwnerSlot = {
  id:        string
  start:     string   // "09:00"
  end:       string   // "11:30"
  days:      string   // "Mon–Sun" | "Mon, Fri"
  price:     number   // total slot price (not per-hour)
  discount:  number   // percent 0-100
  is_active: boolean
}

export type LibraryMeta = {
  slots:       OwnerSlot[]
  description: string | null   // human-readable description if any
}

export function parseLibraryMeta(raw: string | null): LibraryMeta {
  if (!raw) return { slots: [], description: null }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && ('slots' in parsed)) {
      return {
        slots:       ((parsed.slots as OwnerSlot[]) ?? []).filter((s) => s.is_active),
        description: parsed.description ?? null,
      }
    }
    // It parsed as JSON but has no slots → treat as plain text
    return { slots: [], description: raw }
  } catch {
    // Not JSON → plain text description
    return { slots: [], description: raw }
  }
}

/** Convert an OwnerSlot to a display-friendly booking option */
export type SlotOption = {
  id:           string
  label:        string   // "9:00 AM – 11:30 AM"
  days:         string
  startH:       number
  startM:       number
  endH:         number
  endM:         number
  durationMins: number
  finalPrice:   number   // after discount
  basePrice:    number
  discount:     number
}

export function ownerSlotToOption(slot: OwnerSlot): SlotOption {
  const [startH, startM] = slot.start.split(':').map(Number)
  const [endH, endM]     = slot.end.split(':').map(Number)
  const durationMins     = (endH * 60 + endM) - (startH * 60 + startM)
  const finalPrice       = Math.round(slot.price * (1 - slot.discount / 100))

  const fmt = (h: number, m: number) => {
    const ampm   = h >= 12 ? 'PM' : 'AM'
    const h12    = h % 12 || 12
    const minStr = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
    return `${h12}${minStr} ${ampm}`
  }

  return {
    id:           slot.id,
    label:        `${fmt(startH, startM)} – ${fmt(endH, endM)}`,
    days:         slot.days,
    startH, startM, endH, endM,
    durationMins,
    finalPrice,
    basePrice:    slot.price,
    discount:     slot.discount,
  }
}