'use client'

/**
 * SeatGrid — the landing page's recurring visual language.
 *
 * This mirrors the real state machine a booking actually goes through in the
 * product (see lib/booking/* and the escrow/booking status columns):
 *
 *   off       — no data yet (pre-product state, used only in the "before" panel)
 *   free      — seat is open
 *   held      — a hold exists (checkout in progress, time-boxed by hold_expires_at)
 *   booked    — payment captured, seat reserved
 *   checkedin — the booking's QR was scanned — presence confirmed, not just payment
 *
 * Colours are pulled straight from the product's own design tokens
 * (tailwind.config.js), never invented for this page.
 */

export type SeatState = 'off' | 'free' | 'held' | 'booked' | 'checkedin'

const STATE_CLASSES: Record<SeatState, string> = {
  off: 'border border-ink/10 bg-transparent',
  free: 'border border-divider bg-surface',
  held: 'border border-gold bg-gold/25 animate-pulse-dot',
  booked: 'border border-blue-dk bg-blue',
  checkedin: 'border border-blue-dk bg-blue-dk',
}

interface SeatGridProps {
  cells: SeatState[]
  cols: number
  cellSize?: number
  gap?: number
  className?: string
  /** Label read by screen readers describing what this grid currently represents */
  label?: string
}

export default function SeatGrid({
  cells,
  cols,
  cellSize = 22,
  gap = 5,
  className = '',
  label = 'Live seat availability grid',
}: SeatGridProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gap: `${gap}px`,
      }}
    >
      {cells.map((state, i) => (
        <div
          key={i}
          className={`relative rounded-[5px] transition-colors duration-500 ${STATE_CLASSES[state]}`}
          style={{ width: cellSize, height: cellSize }}
        >
          {state === 'checkedin' && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-white leading-none"
              style={{ fontSize: Math.max(9, cellSize * 0.42) }}
            >
              ✓
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Small inline legend used wherever a grid appears, so the colour code is never assumed. */
export function SeatGridLegend({ className = '' }: { className?: string }) {
  const items: { state: SeatState; label: string }[] = [
    { state: 'free', label: 'Free' },
    { state: 'held', label: 'Held' },
    { state: 'booked', label: 'Booked' },
    { state: 'checkedin', label: 'Checked in' },
  ]
  return (
    <div className={`flex items-center gap-4 flex-wrap ${className}`}>
      {items.map((it) => (
        <div key={it.state} className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-[3px] ${STATE_CLASSES[it.state]}`} />
          <span className="text-[11px] text-muted font-medium">{it.label}</span>
        </div>
      ))}
    </div>
  )
}
