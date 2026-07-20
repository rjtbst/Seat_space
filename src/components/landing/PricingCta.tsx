'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'

const COSTS = [
  {
    title: '₹399/month',
    detail: 'to list a library and appear in student search — flat, not per seat.',
  },
  {
    title: 'A fee on top, not off the top',
    detail:
      "added to what the student pays at checkout. You receive exactly the price you set.",
  },
  // {
  //   title: '5% on membership plans',
  //   detail: 'sold through the platform — lower than the booking fee, on purpose.',
  // },
]

export default function PricingCta() {
  return (
    <section id="pricing" className="py-20 md:py-28 px-6 md:px-10">
      <div className="max-w-[900px] mx-auto">
        <div className="reveal text-center max-w-[560px] mx-auto mb-12">
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-4">
            What it costs. Plainly.
          </h2>
          <p className="text-[15px] text-muted">
            No tiers to compare, no trial that expires partway through your
            first month.
          </p>
        </div>

        <div className="reveal delay-200 grid md:grid-cols-2 gap-5 mb-14">
          {COSTS.map((c) => (
            <div key={c.title} className="card p-6">
              <div className="w-8 h-8 rounded-[9px] bg-blue-lt flex items-center justify-center mb-4">
                <Check size={15} className="text-blue-dk" />
              </div>
              <h3 className="font-syne font-bold text-[17px] text-ink mb-2">{c.title}</h3>
              <p className="text-[13.5px] text-muted leading-relaxed">{c.detail}</p>
            </div>
          ))}
        </div>

        <div className="reveal delay-400 rounded-[24px] bg-ink px-8 py-14 md:py-16 text-center">
          <p className="font-serif italic text-[26px] md:text-[32px] text-white leading-snug max-w-[620px] mx-auto mb-8">
            This isn&apos;t just software for running your library. It&apos;s
            how students find it, too — and everything that happens after
            they do.
          </p>
          <Link href="/login?mode=signup" className="btn btn-primary btn-hero">
            List your library →
          </Link>
        </div>
      </div>
    </section>
  )
}
