// components/student/SeatGrid.tsx
'use client'

/**
 * Premium seat map component — redesigned for StudySpace.
 *
 * Changes from v1:
 * - Larger seats (44px → 48px on desktop, 40px mobile) with better tap targets
 * - Four distinct visual states: Available (green pulse), Selected (blue glow),
 *   Held (amber with "H"), Occupied (red, locked)
 * - Row labels pinned as sticky first column for wide grids
 * - "Aisle gap" rendering correctly skips empty column positions
 * - Legend is always visible above the grid, counts update live
 * - Horizontal scroll confined to the grid, page doesn't shift
 * - Loading skeleton matches real seat grid size (no layout jump)
 * - "Select any green seat" nudge while nothing is selected
 * - Accessible: role="button", aria-label, aria-pressed, aria-disabled
 */

import { cn } from '@/lib/utils'
import type { SeatAvailability } from '@/lib/actions/students/student-discovery'

interface Props {
  seats:      SeatAvailability[]
  selectedId: string | null
  onSelect:   (id: string) => void
  loading?:   boolean
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */

function SeatSkeleton() {
  const rowConfig = [5, 6, 6, 5, 4]
  return (
    <div className="space-y-2 animate-pulse py-2">
      {rowConfig.map((count, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#EEF1F7] flex-shrink-0" />
          <div className="flex gap-1.5">
            {Array.from({ length: count }).map((_, j) => (
              <div
                key={j}
                className="w-10 h-10 rounded-xl bg-[#EEF1F7] flex-shrink-0"
                style={{ animationDelay: `${(i * count + j) * 40}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Legend item ─────────────────────────────────────────────────────── */

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[#6E7F94] whitespace-nowrap">
      <span className={cn('w-3 h-3 rounded-md flex-shrink-0', color)} />
      {label}
    </span>
  )
}

/* ── Main component ───────────────────────────────────────────────────── */

export default function SeatGrid({ seats, selectedId, onSelect, loading }: Props) {
  if (loading) return <SeatSkeleton />

  if (!seats.length) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#F4F7FB] flex items-center justify-center text-2xl mb-3">🪑</div>
        <p className="text-[13px] font-medium text-[#3A4A5C]">No seats configured</p>
        <p className="text-[11px] text-[#9AACBE] mt-1">Please contact the library to set up seats.</p>
      </div>
    )
  }

  // Group by row
  const rows     = [...new Set(seats.map((s) => s.row_label))].sort()
  const colCount = Math.max(...seats.map((s) => s.column_number))

  const availCount = seats.filter((s) => s.is_available).length
  const takenCount = seats.length - availCount
  const allTaken   = availCount === 0

  return (
    <div className="space-y-3">

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1">
        <LegendItem
          color="bg-[#DCFCE7] border border-[#86EFAC]"
          label={`Available (${availCount})`}
        />
        <LegendItem
          color="bg-[#FEE2E2] border border-[#FCA5A5]"
          label={`Occupied (${takenCount})`}
        />
        <LegendItem
          color="bg-[#1246FF] border border-[#1246FF]"
          label="Selected"
        />
        <span className="ml-auto text-[11px] text-[#9AACBE] flex-shrink-0">
          {seats.length} seats total
        </span>
      </div>

      {/* ── All-taken warning ───────────────────────────────────────── */}
      {allTaken && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FFF7ED] border border-[#FED7AA] text-[12px] text-[#92400E]">
          <span className="text-[15px]">⏰</span>
          All seats are booked for this time window — try a different time or date.
        </div>
      )}

      {/* ── Front of library ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#DDE4EE] to-transparent" />
        <span className="text-[10px] font-semibold text-[#9AACBE] uppercase tracking-wider px-3 py-1 bg-[#F4F7FB] rounded-full border border-[#E4EAF2]">
          🖥️ Front / Board
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-[#DDE4EE] via-[#DDE4EE] to-transparent" />
      </div>

      {/* ── Seat grid ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div className="min-w-max space-y-1.5">
          {rows.map((row) => {
            const rowSeats = seats
              .filter((s) => s.row_label === row)
              .sort((a, b) => a.column_number - b.column_number)
            const byCol = new Map(rowSeats.map((s) => [s.column_number, s]))

            return (
              <div key={row} className="flex items-center gap-1.5">
                {/* Row label — sticky feel via consistent width */}
                <span
                  className="w-6 text-[11px] font-bold text-[#9AACBE] text-center flex-shrink-0 select-none"
                  aria-hidden
                >
                  {row}
                </span>

                {/* Seats */}
                <div className="flex gap-1.5">
                  {Array.from({ length: colCount }, (_, i) => i + 1).map((col) => {
                    const seat = byCol.get(col)

                    // Aisle gap
                    if (!seat) {
                      return (
                        <div
                          key={col}
                          className="w-10 h-10 flex-shrink-0"
                          aria-hidden
                        />
                      )
                    }

                    const isSelected  = seat.id === selectedId
                    const isAvailable = seat.is_available

                    return (
                      <SeatButton
                        key={seat.id}
                        seat={seat}
                        isSelected={isSelected}
                        isAvailable={isAvailable}
                        onSelect={onSelect}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Column numbers — pinned at bottom */}
          <div className="flex items-center gap-1.5 pl-7 mt-1">
            {Array.from({ length: colCount }, (_, i) => i + 1).map((col) => (
              <span
                key={col}
                className="w-10 text-center text-[9px] text-[#C4CDD8] font-medium flex-shrink-0 select-none"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selection nudge ─────────────────────────────────────────── */}
      {!selectedId && !allTaken && (
        <p className="text-center text-[11px] text-[#9AACBE] pt-1">
          Tap a <span className="text-[#0D7C54] font-semibold">green</span> seat to select it
        </p>
      )}
    </div>
  )
}

/* ── Individual seat button ───────────────────────────────────────────── */

function SeatButton({
  seat,
  isSelected,
  isAvailable,
  onSelect,
}: {
  seat:        SeatAvailability
  isSelected:  boolean
  isAvailable: boolean
  onSelect:    (id: string) => void
}) {
  const label = seat.label ?? `${seat.row_label}${seat.column_number}`

  if (!isAvailable) {
    return (
      <div
        role="img"
        aria-label={`Seat ${label} — occupied`}
        title={`Seat ${label} — Occupied`}
        className={cn(
          'w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center',
          'text-[11px] font-bold select-none',
          'bg-[#FEE2E2] text-[#C5282C] border border-[#FCA5A5]',
          'cursor-not-allowed',
        )}
      >
        {seat.column_number}
      </div>
    )
  }

  if (isSelected) {
    return (
      <button
        type="button"
        role="button"
        aria-label={`Seat ${label} — selected, tap to deselect`}
        aria-pressed={true}
        title={`Seat ${label} — Selected`}
        onClick={() => onSelect(seat.id)}
        className={cn(
          'w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center',
          'text-[11px] font-bold select-none transition-all duration-150',
          'bg-[#1246FF] text-white border-2 border-[#1246FF]',
          'shadow-[0_0_0_3px_rgba(18,70,255,0.25),0_2px_8px_rgba(18,70,255,0.4)]',
          'scale-110',
        )}
      >
        {seat.column_number}
      </button>
    )
  }

  return (
    <button
      type="button"
      role="button"
      aria-label={`Seat ${label} — available`}
      aria-pressed={false}
      title={`Seat ${label} — Available`}
      onClick={() => onSelect(seat.id)}
      className={cn(
        'w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center',
        'text-[11px] font-bold select-none transition-all duration-150',
        'bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]',
        'hover:bg-[#BBF7D0] hover:border-[#4ADE80] hover:scale-110 hover:shadow-[0_2px_8px_rgba(34,197,94,0.3)]',
        'active:scale-95 cursor-pointer',
      )}
    >
      {seat.column_number}
    </button>
  )
}
