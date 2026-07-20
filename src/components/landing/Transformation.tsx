'use client'

import { useEffect, useState } from 'react'
import { Phone, ClipboardList, MessageCircle, HelpCircle } from 'lucide-react'
import SeatGrid from './SeatGrid'
import { useAmbientSeats } from './useAmbientSeats'

const BEFORE_ITEMS = [
  { icon: Phone, text: 'Ringing, sometimes answered' },
  { icon: ClipboardList, text: 'A register, filled by hand' },
  { icon: MessageCircle, text: 'Payment proof in a WhatsApp thread' },
  { icon: HelpCircle, text: "Today's occupancy — a guess" },
]

const COLS = 9
const ROWS = 3

export default function Transformation() {
  const [view, setView] = useState<'before' | 'after'>('before')
  const cells = useAmbientSeats(COLS * ROWS, { tickMs: 1800 })

  useEffect(() => {
    const t = setTimeout(() => setView('after'), 2200)
    return () => clearTimeout(t)
  }, [])

  return (
    <section id="transformation" className="py-20 md:py-28 px-6 md:px-10 bg-warm/40">
      <div className="max-w-[1100px] mx-auto">
        <div className="reveal text-center max-w-[560px] mx-auto mb-12">
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-4">
            The room didn&apos;t change.
            <br />
            What you know about it did.
          </h2>
          <p className="text-[15px] text-muted">
            Same seats, same desk, same students. The difference is whether
            anyone — you, your staff, or the person walking in — has to
            guess.
          </p>
        </div>

        {/* Toggle */}
        <div className="reveal delay-200 flex justify-center mb-8">
          <div className="inline-flex rounded-full border border-divider bg-surface p-1">
            <button
              onClick={() => setView('before')}
              className={`px-5 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                view === 'before' ? 'bg-ink text-white' : 'text-muted'
              }`}
            >
              Before
            </button>
            <button
              onClick={() => setView('after')}
              className={`px-5 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                view === 'after' ? 'bg-blue text-white' : 'text-muted'
              }`}
            >
              After
            </button>
          </div>
        </div>

        <div className="reveal delay-400 card p-8 md:p-12 min-h-[280px] flex items-center justify-center">
          {view === 'before' ? (
            <div className="grid grid-cols-2 gap-6 md:gap-10 w-full max-w-[520px]">
              {BEFORE_ITEMS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-bg flex items-center justify-center flex-shrink-0">
                    <Icon size={17} className="text-muted" />
                  </div>
                  <p className="text-[14px] text-ink-2 leading-snug pt-1.5">{text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              <SeatGrid
                cells={cells}
                cols={COLS}
                cellSize={22}
                gap={5}
                label="Live seat grid after adopting seatspace"
              />
              <p className="text-[13px] text-muted mt-6 text-center max-w-[420px]">
                A walk-in gets assigned onto this exact grid — the same seat
                map a booking made from home already uses. One record, not
                two systems to reconcile.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
