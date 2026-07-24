'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'

// Every line reflects a real, shipped capability — no "unlimited X" claims
// that aren't actually enforced/unenforced in the schema, and no channels
// (like WhatsApp reminders) that don't actually exist yet.
const INCLUDED = [
  'No per-seat or per-student fee',
  'Online bookings and walk-ins, one dashboard',
  'Membership plans and renewals',
  'Coupon codes for promotions',
  'Time-slot based pricing',
  'Staff accounts with QR check-in',
  'Multiple libraries, one login',
  'Book issue and return tracking',
  'Listed in student search',
]

export default function PricingCta() {
  return (
    <section id="pricing" className="py-20 md:py-16 px-6 md:px-10">
      <div className="max-w-[900px] mx-auto">
        <div className="reveal text-center max-w-[560px] mx-auto mb-12">
          <span className="chip chip-green mb-4">For library owners — 14-day free trial on your first library</span>
          <h2 className="font-syne font-extrabold text-display-md text-ink mb-4">
            What it costs. Plainly.
          </h2>
          <p className="text-[15px] text-muted">
            ₹399/month per library, flat, plus a small fee added to what the
            student pays at checkout — you receive exactly the price you
            set. No tiers to compare, no card needed for the trial.
          </p>
        </div>

        <div className="reveal delay-200 card p-7 md:p-8 mb-14">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {INCLUDED.map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <Check size={15} className="text-green mt-0.5 flex-shrink-0" />
                <span className="text-[13.5px] text-ink-2">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="reveal delay-400 rounded-[24px] bg-ink px-8 py-14 md:py-16 text-center">
          <h3 className="font-syne font-extrabold text-[24px] md:text-[30px] text-white mb-3">
            Ready to modernize your library?
          </h3>
          <p className="text-[15px] text-white/70 max-w-[480px] mx-auto mb-8">
            Simplify operations, get found by students searching nearby, and
            run the whole thing from one dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup&role=owner" className="btn btn-primary btn-hero">
              Start your 14-day free trial →
            </Link>
            <Link href="/explore" className="btn btn-outline btn-hero !text-white !border-white/30 hover:!bg-white/10">
              Explore libraries
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
