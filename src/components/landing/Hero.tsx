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
      className="relative pt-32 pb-20 md:pt-40 md:pb-28 px-6 md:px-10 overflow-hidden"
    >
      <div className="max-w-[1200px] mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-10 items-center">
        {/* Outcome */}
        <div className="reveal">
          <span className="chip chip-blue mb-5">For study library owners</span>
          <h1 className="font-syne font-extrabold text-display-lg text-ink mb-5">
            Fill every seat.
            <br />
            Get paid <span className="text-blue">on schedule</span>.
          </h1>
          <p className="text-[17px] text-muted leading-relaxed max-w-[440px] mb-8">
            seatspace is the operating system for a study library — seats,
            walk-ins, staff, payments, memberships and books, all running from
            one place. Not a booking widget bolted onto how you already run
            things.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login?mode=signup" className="btn btn-primary btn-hero">
              List your library →
            </Link>
            <a href="#transformation" className="btn btn-outline btn-hero">
              See what changes
            </a>
          </div>
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
            This is the same seat grid a student sees, and the same one staff
            use at the desk — animated here to show how it behaves.
          </p>
        </div>
      </div>
    </section>
  )
}
