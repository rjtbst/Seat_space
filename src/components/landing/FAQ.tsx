'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Every answer here is sourced from actual product/policy logic (see
// src/lib/actions/library.ts for the trial, src/app/(pages)/refunds for the
// cancellation terms, PricingCta.tsx for pricing) — nothing here is a
// marketing claim invented for this section.
const FAQS = [
  {
    q: 'How does the 14-day free trial work?',
    a: "Your first library goes live free for 14 days — no credit card needed to list it. If you keep it running past that, it's ₹399/month, flat, regardless of how many seats or students you have.",
  },
  {
    q: 'What does seatspace cost after the trial?',
    a: 'A flat ₹399/month per library to appear in student search and keep bookings open — not a per-seat or per-student fee. On top of that, a booking fee is added to what the student pays at checkout, so you receive exactly the price you set.',
  },
  {
    q: 'Can I run more than one library?',
    a: 'Yes — every library after your first needs an active ₹399/month subscription (the free trial only applies once, to your first library), and you manage all of them from a single dashboard and login.',
  },
  {
    q: "What happens if a student cancels a booking?",
    a: 'Students can cancel themselves up to 20 minutes before a booking starts, refunded automatically. Inside that window, or after check-in, cancellations go through a manual review request instead of an instant refund.',
  },
  {
    q: 'Do I need to keep a paper register anymore?',
    a: "No — seats, walk-ins, check-ins and bookings all update the same dashboard in real time, replacing the register-plus-booking-app routine with one screen.",
  },
]

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="py-20 md:py-28 px-6 md:px-10">
      <div className="max-w-[720px] mx-auto">
        <div className="reveal text-center mb-10">
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-3">
            Questions library owners actually ask
          </h2>
          <p className="text-[15px] text-muted">
            Straight answers, no fine print buried elsewhere.
          </p>
        </div>

        <div className="reveal delay-200 flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i
            return (
              <div key={item.q} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-syne font-bold text-[14.5px] text-ink">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-muted flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 text-[13.5px] text-muted leading-relaxed">
                    {item.a}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
