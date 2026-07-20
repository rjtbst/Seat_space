'use client'

import { TrendingUp, Wallet, LayoutGrid } from 'lucide-react'
import { useAmbientSeats } from './useAmbientSeats'

const OUTCOMES = [
  {
    icon: TrendingUp,
    title: 'More seats filled',
    detail: 'Students searching nearby find you before they\u2019d ever have picked up the phone.',
  },
  {
    icon: Wallet,
    title: 'Paid without chasing anyone',
    detail: 'Money lands on its own schedule — you\u2019re not the one following up.',
  },
  {
    icon: LayoutGrid,
    title: 'Everything in one place',
    detail: 'Seats, pricing, memberships, coupons, books, staff and every branch — one login.',
  },
]

export default function OwnersOutcomes() {
  const bars = useAmbientSeats(10, { tickMs: 2600, bookedRatio: 0.55, heldRatio: 0.1, freeRatio: 0.25 })

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {OUTCOMES.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="card p-6">
            <div className="w-9 h-9 rounded-[10px] bg-blue-lt flex items-center justify-center mb-4">
              <Icon size={16} className="text-blue-dk" />
            </div>
            <h3 className="font-syne font-bold text-[16px] text-ink mb-2">{title}</h3>
            <p className="text-[13.5px] text-muted leading-relaxed">{detail}</p>
          </div>
        ))}
      </div>

      <div className="card p-5 flex items-center gap-5 flex-wrap">
        <span className="text-[11px] font-bold tracking-widest uppercase text-pale flex-shrink-0">
          Today, at a glance
        </span>
        <div className="flex items-end gap-1 h-8 flex-1 min-w-[140px]">
          {bars.map((c, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-[3px] transition-all duration-500 ${
                c === 'free' ? 'bg-divider h-2' : c === 'held' ? 'bg-gold h-5' : 'bg-blue h-7'
              }`}
            />
          ))}
        </div>
        <span className="text-[12px] text-muted flex-shrink-0">Occupancy, updating as it happens</span>
      </div>
    </div>
  )
}
