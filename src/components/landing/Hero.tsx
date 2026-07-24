'use client'

import Link from 'next/link'
import SeatGrid, { SeatGridLegend } from './SeatGrid'
import { useAmbientSeats } from './useAmbientSeats'

const COLS = 10
const ROWS = 4

export default function Hero() {
  const cells = useAmbientSeats(COLS * ROWS, { tickMs: 1600 })
  const activity = cells.filter((c) => c !== 'free').length

  return (
    <section
      id="recognition"
      className="relative py-24 md:pt-24 md:pb-12 px-6 md:px-10 overflow-hidden"
    >
      <div className="max-w-[1200px] mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-10 items-center">
        {/* Outcome */}
        <div className="reveal">
          <span className="chip chip-blue mb-5">Manage your study library. Help students find it.</span>
          <h1 className="font-syne font-extrabold text-display-lg text-ink mb-5">
            Find your seat.
            <br />
            <span className="text-blue">Run</span> your library.
          </h1>
          <p className="text-[17px] text-muted leading-relaxed max-w-[440px] mb-2">
           Students discover and book nearby study libraries with live seat availability.
          </p>
           <p className="text-[17px] text-muted leading-relaxed max-w-[440px] mb-8">
           Library owners manage bookings, memberships, pricing, staff, payments, and daily operations from one dashboard.
          </p>

          {/* Two clear paths — same product, different job to do */}
          <div className="grid sm:grid-cols-2 gap-3 max-w-[460px]">
            <Link
              href="/explore"
              className="card p-4 hover:border-ink/30 transition-colors"
            >
              <div className="text-[12px] font-semibold text-blue-dk uppercase tracking-wide mb-1">
                I'm a student
              </div>
              <div className="text-[13px] text-ink-2 leading-snug">
                Find and book a seat nearby →
              </div>
            </Link>
            <Link
              href="/login?mode=signup&role=owner"
              className="card p-4 hover:border-ink/30 transition-colors"
            >
              <div className="text-[12px] font-semibold text-blue-dk uppercase tracking-wide mb-1">
                I run a library
              </div>
              <div className="text-[13px] text-ink-2 leading-snug">
                Start your 14-day free trial →
              </div>
            </Link>
          </div>
          <p className="text-[12.5px] text-pale mt-4">
            Free to search and book as a student. No credit card required to
            trial your first library for 14 days.
          </p>
        </div>

        {/* Living seat grid */}
        <div className="reveal delay-200">
          <div className="card p-5 md:p-6 bg-surface">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                Live seat map
              </span>
              <span className="chip chip-green">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot" />
                {activity} of {COLS * ROWS} in use
              </span>
            </div>

            <SeatGrid
              cells={cells}
              cols={COLS}
              cellSize={22}
              gap={5}
              className="mx-auto"
              label="A demonstration seat grid showing seats moving between free, held, booked and checked-in"
            />

            <div className="mt-4 pt-4 border-t border-divider flex items-center justify-between flex-wrap gap-3">
              <SeatGridLegend />
            </div>
          </div>
          <p className="text-[12px] text-pale mt-3 text-center">
            This is the same seat grid a student books from, the same one
            staff use at the desk, and the same one an owner watches fill up.
          </p>
        </div>
      </div>
    </section>
  )
}
