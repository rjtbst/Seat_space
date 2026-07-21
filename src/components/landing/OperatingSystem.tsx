'use client'

import { useEffect, useState } from 'react'
import { Repeat, BookOpen, Users, Building2, ScanLine } from 'lucide-react'
import SeatGrid from './SeatGrid'
import PayoutThread from './PayoutThread'
import { useAmbientSeats } from './useAmbientSeats'

function useCycle<T>(values: readonly T[], intervalMs: number): T {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % values.length), intervalMs)
    return () => clearInterval(t)
  }, [values.length, intervalMs])
  return values[i]
}

function Tile({
  eyebrow,
  className = '',
  children,
}: {
  eyebrow: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`card p-5 flex flex-col ${className}`}>
      <span className="text-[10px] font-bold tracking-widest uppercase text-pale mb-3">
        {eyebrow}
      </span>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}

export default function OperatingSystem() {
  const seatsCells = useAmbientSeats(24, { tickMs: 1500 })
  const branchACells = useAmbientSeats(8, { tickMs: 2200 })
  const branchBCells = useAmbientSeats(8, { tickMs: 2600 })

  const bookState = useCycle(['Issued', 'Returned'] as const, 2400)
  const membershipTick = useCycle(['Waiting', 'Renewed'] as const, 3000)

  return (
    <section id="operating-system" className="py-20 md:py-28 px-6 md:px-10">
      <div className="max-w-[1100px] mx-auto">
        <div className="reveal text-center max-w-[600px] mx-auto mb-12">
          <span className="chip chip-gold mb-4">For library owners — the heart of the platform</span>
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-4">
            One dashboard. Every part of the business.
          </h2>
          <p className="text-[15px] text-muted">
            Seats, payments, memberships, the book counter, staff, and every
            branch you run — reading from the same live data, at the same
            time. Not six tools pretending to be one.
          </p>
        </div>

        <div className="reveal delay-200 grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-min">
          {/* Seats — large */}
          <Tile eyebrow="Seats" className="md:col-span-2 md:row-span-2">
            <div className="flex items-center justify-between mb-3">
              <SeatGrid cells={seatsCells} cols={8} cellSize={19} gap={4} label="Live seats tile" />
              <div className="flex flex-col items-center gap-1 pl-4 border-l border-divider">
                <ScanLine size={18} className="text-blue" />
                <span className="text-[10px] text-muted text-center leading-tight">
                  QR check-in
                  <br />
                  confirms presence
                </span>
              </div>
            </div>
            <p className="text-[13px] text-ink-2 mt-auto">
              Online bookings, walk-ins and check-ins — one grid, one source of truth.
            </p>
          </Tile>

          {/* Payments */}
          <Tile eyebrow="Payouts">
            <PayoutThread compact intervalMs={1600} className="mb-3" />
            <p className="text-[13px] text-ink-2 mt-auto">
              Released on a schedule, not chased manually.
            </p>
          </Tile>

          {/* Memberships */}
          <Tile eyebrow="Memberships">
            <div className="flex items-center gap-2 mb-3">
              <Repeat size={16} className="text-green-2" />
              <span className="text-[13px] font-semibold text-ink">{membershipTick}</span>
            </div>
            <p className="text-[13px] text-ink-2 mt-auto">
              Plans renew on their own — single-library or across branches.
            </p>
          </Tile>

          {/* Books */}
          <Tile eyebrow="Books">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-gold" />
              <span className="text-[13px] font-semibold text-ink">{bookState}</span>
            </div>
            <p className="text-[13px] text-ink-2 mt-auto">
              The lending desk, tracked next to the seat it&apos;s issued from.
            </p>
          </Tile>

          {/* Staff */}
          <Tile eyebrow="Staff">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-blue" />
              <div className="flex gap-1.5">
                <span className="chip chip-blue">Staff</span>
                <span className="chip chip-gold">Senior</span>
              </div>
            </div>
            <p className="text-[13px] text-ink-2 mt-auto">
              Front-desk access for the floor, catalog control for senior staff.
            </p>
          </Tile>

          {/* Branches */}
          <Tile eyebrow="Branches" className="">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={16} className="text-ink-3" />
              <span className="text-[13px] font-semibold text-ink">One login, every location</span>
            </div>
            <div className="flex flex-wrap gap-8">
              <div>
                <span className="text-[10px] text-pale font-semibold uppercase tracking-wide mb-2 block">
                  Branch A
                </span>
                <SeatGrid cells={branchACells} cols={4} cellSize={16} gap={3} label="Branch A seats" />
              </div>
              <div>
                <span className="text-[10px] text-pale font-semibold uppercase tracking-wide mb-2 block">
                  Branch B
                </span>
                <SeatGrid cells={branchBCells} cols={4} cellSize={16} gap={3} label="Branch B seats" />
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </section>
  )
}
