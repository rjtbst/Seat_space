// components/student/SubscribeModal.tsx
'use client'

/**
 * Modal for subscribing to a library membership plan.
 *
 * Flow (per the subscription-model spec's "Student Purchase Flow"):
 *   1. Plan + library are already chosen by the time this modal opens
 *      (the student is on this library's detail page) — steps 1-2.
 *   2. Pick an available seat in this library for the plan's window — step 3.
 *   3. Pick a start date (defaults to today) — step 4.
 *   4. Optional coupon code — step 5.
 *   5. initiatePlanSubscription (validates seat availability, creates
 *      Razorpay order, atomically inserts subscription+payment) — step 6.
 *   6. Razorpay checkout, then confirmSubscriptionPayment → success state,
 *      with the subscription's QR digital pass shown immediately after.
 *
 * The seat, once paid for, stays reserved for the whole subscription
 * duration — the student never books it again; they just show up and
 * scan their QR code (see SubscriptionsClient.tsx for the pass itself).
 */

import { useEffect, useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, Tag, Armchair, Calendar } from 'lucide-react'
import { useRazorpay } from '@/hooks/userazorpay'
import {
  initiatePlanSubscription,
  confirmSubscriptionPayment,
  getAvailableSeatsForPlan,
} from '@/lib/actions/students/student-subscriptions'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'
import { ClayButton, ClayInput } from '@/components/ui/clay'

export type SubscribeModalPlan = {
  id:            string
  name:          string
  price:         number
  duration_days: number
  time_window_start?: string | null  // "HH:MM:SS", null = valid any time of day
  time_window_end?:   string | null
  days_of_week?:      number[] | null // 0=Sun..6=Sat, null = valid every day
}

interface SubscribeModalProps {
  plan:        SubscribeModalPlan
  libraryId:   string
  libraryName: string
  onClose:     () => void
}

type Stage = 'seat' | 'form' | 'processing' | 'success'

function todayISO(): string {
  // IST calendar date, matching how the RPC computes "today" server-side.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

export function SubscribeModal({ plan, libraryId, libraryName, onClose }: SubscribeModalProps) {
  const { openCheckout } = useRazorpay()

  const [stage, setStage]       = useState<Stage>('seat')
  const [seats, setSeats]       = useState<{ id: string; label: string }[] | null>(null)
  const [seatId, setSeatId]     = useState<string | null>(null)
  const [startDate, setStartDate] = useState(todayISO())
  const [couponCode, setCoupon] = useState('')
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAvailableSeatsForPlan(plan.id, libraryId).then(list => {
      if (!cancelled) setSeats(list)
    })
    return () => { cancelled = true }
  }, [plan.id, libraryId])

  async function handleSubscribe() {
    if (!seatId) { setError('Please select a seat'); return }
    setError(null)
    setStage('processing')

    const res = await initiatePlanSubscription({
      planId:     plan.id,
      libraryId,
      seatId,
      startDate,
      couponCode: couponCode.trim() || undefined,
    })

    if (res.success === false) {
      setError(res.error)
      setStage('form')
      return
    }

    await openCheckout({
      orderId:     res.data.razorpayOrderId,
      keyId:       res.data.razorpayKeyId,
      amount:      res.data.amount,
      name:        libraryName,
      description: `${res.data.planName} membership`,
      onSuccess: async (paymentId, orderId, signature) => {
        const confirmRes = await confirmSubscriptionPayment({
          subscriptionId:    res.data.subscriptionId,
          razorpayOrderId:   orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        })
        if (confirmRes.success === false) {
          setError(confirmRes.error)
          setStage('form')
          return
        }
        setStage('success')
      },
      onDismiss: () => setStage('form'),
      onError:   (err) => { setError(err); setStage('form') },
    })
  }

  const selectedSeat = seats?.find(s => s.id === seatId)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="clay-raised w-full sm:max-w-md overflow-hidden" style={{ background: 'var(--clay-surface)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.2)' }}>
          <div>
            <div className="text-[14px] font-bold text-[#0D1117]">Subscribe to {plan.name}</div>
            <div className="text-[11px] text-[#9AACBE] mt-0.5">{libraryName}</div>
          </div>
          <button onClick={onClose} className="text-[#9AACBE] hover:text-[#6E7F94] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {stage === 'processing' && (
            <div className="py-8 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#1E5CFF]" />
              <div className="text-[12px] text-[#9AACBE]">Setting up your subscription…</div>
            </div>
          )}

          {error && (
            <div className="clay-raised-sm flex items-center gap-2 text-[12px] text-[#C5282C] p-3" style={{ background: '#FFF0F0' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {stage === 'success' && (
            <div className="py-6 text-center space-y-3">
              <CheckCircle className="w-12 h-12 text-[#0D7C54] mx-auto" />
              <div className="text-[14px] font-bold text-[#0D1117]">You're subscribed!</div>
              <div className="text-[12px] text-[#6E7F94]">
                Your {plan.name} membership is active — Seat {selectedSeat?.label}. Find your QR
                digital pass under "My Subscriptions" and show it at the library.
              </div>
              <ClayButton onClick={onClose} className="mt-2 px-6 py-2.5">
                Done
              </ClayButton>
            </div>
          )}

          {/* ── STEP: seat picker ── */}
          {stage === 'seat' && (
            <>
              <div className="clay-pressed p-3.5 space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#6E7F94]">Plan price</span>
                  <span className="font-semibold text-[#0D1117]">₹{plan.price}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[#9AACBE]">
                  <span>Duration</span>
                  <span>{plan.duration_days} days</span>
                </div>
                {plan.time_window_start && plan.time_window_end && (
                  <div className="flex justify-between text-[12px] text-[#92400E]">
                    <span>Hours</span>
                    <span className="font-semibold">{plan.time_window_start.slice(0, 5)}–{plan.time_window_end.slice(0, 5)}</span>
                  </div>
                )}
                {describeDaysOfWeek(plan.days_of_week) && (
                  <div className="flex justify-between text-[12px] text-[#92400E]">
                    <span>Days</span>
                    <span className="font-semibold">{describeDaysOfWeek(plan.days_of_week)}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0D1117] mb-1.5">
                  <Armchair className="w-3.5 h-3.5" />
                  Choose your seat
                </label>
                {seats === null ? (
                  <div className="text-[12px] text-[#9AACBE] py-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading available seats…
                  </div>
                ) : seats.length === 0 ? (
                  <div className="text-[12px] text-[#C5282C] py-2">
                    No seats are free for this plan's schedule right now. Please try again later or pick a different plan.
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2 max-h-[180px] overflow-y-auto pr-1">
                    {seats.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSeatId(s.id)}
                        className={`clay-interactive py-2 rounded-lg text-[12px] font-bold ${
                          seatId === s.id
                            ? 'bg-gradient-to-br from-[#4D78FF] to-[#0D3AE0] text-white'
                            : 'clay-raised-sm text-[#0D1117]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="text-[10.5px] text-[#9AACBE] mt-2">
                  This seat is reserved for you during the plan's hours for your whole membership — no daily booking needed.
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0D1117] mb-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Start date
                </label>
                <ClayInput
                  type="date"
                  value={startDate}
                  min={todayISO()}
                  onChange={e => setStartDate(e.target.value)}
                  className="py-2.5 font-semibold"
                />
              </div>

              <ClayButton
                onClick={() => { if (!seatId) { setError('Please select a seat'); return }; setError(null); setStage('form') }}
                disabled={!seats?.length}
                size="lg"
                className="w-full"
              >
                Continue
              </ClayButton>
            </>
          )}

          {/* ── STEP: coupon + confirm ── */}
          {stage === 'form' && (
            <>
              <div className="clay-pressed p-3.5 space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#6E7F94]">Plan price</span>
                  <span className="font-semibold text-[#0D1117]">₹{plan.price}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[#9AACBE]">
                  <span>Seat</span>
                  <span className="font-semibold text-[#0D1117]">{selectedSeat?.label}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[#9AACBE]">
                  <span>Starts</span>
                  <span>{new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>

              {/* Coupon code — optional, shared manually by the library owner */}
              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0D1117] mb-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Have a coupon code?
                </label>
                <ClayInput
                  type="text"
                  value={couponCode}
                  onChange={e => setCoupon(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  className="font-semibold tracking-wide"
                  maxLength={40}
                />
                <div className="text-[10.5px] text-[#9AACBE] mt-1">
                  A platform fee is added on top of the final price.
                </div>
              </div>

              <div className="flex gap-2">
                <ClayButton variant="flat" onClick={() => setStage('seat')} size="lg">
                  Back
                </ClayButton>
                <ClayButton onClick={handleSubscribe} size="lg" className="flex-1">
                  Continue to payment
                </ClayButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
