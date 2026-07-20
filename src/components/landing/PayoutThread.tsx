'use client'

import { useEffect, useState } from 'react'

/**
 * Mirrors the real escrow_status lifecycle on a payment
 * (see lib/booking/escrow.ts and the confirm_booking_payment_captured /
 * mark_escrow_eligible_on_checkin / run-payouts flow):
 *
 *   captured -> held -> eligible -> paid_out
 *
 * "held" only advances to "eligible" once the booking has been checked in
 * AND has ended — never on payment alone. That's the one fact this
 * component exists to make visible.
 */
const STEPS = [
  { key: 'captured', label: 'Captured' },
  { key: 'held', label: 'Held' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'paid_out', label: 'Paid out' },
] as const

export default function PayoutThread({
  compact = false,
  intervalMs = 1800,
  className = '',
}: {
  compact?: boolean
  intervalMs?: number
  className?: string
}) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const t = setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length)
    }, intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])

  return (
    <div className={`flex items-center ${className}`} role="group" aria-label="Payment payout status">
      {STEPS.map((step, i) => {
        const reached = i <= active
        const isLast = i === STEPS.length - 1
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`rounded-full flex-shrink-0 transition-colors duration-500 ${
                  compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
                } ${
                  reached
                    ? i === STEPS.length - 1
                      ? 'bg-green-2'
                      : 'bg-blue'
                    : 'border border-divider bg-surface'
                }`}
              />
              {!compact && (
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    reached ? 'text-ink' : 'text-pale'
                  }`}
                >
                  {step.label}
                </span>
              )}
            </div>
            {!isLast && (
              <div
                className={`h-[2px] flex-1 mx-1.5 rounded transition-colors duration-500 ${
                  i < active ? 'bg-blue' : 'bg-divider'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
