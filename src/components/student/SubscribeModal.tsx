// components/student/SubscribeModal.tsx
'use client'

/**
 * Modal for subscribing to a library membership plan — the flow that was
 * previously entirely unwired: LibraryDetail.tsx's plan cards linked to
 * /student/plans, a route that was never built, and the two server actions
 * this calls (initiatePlanSubscription / confirmSubscriptionPayment)
 * had zero UI call sites anywhere in the app.
 *
 * Flow:
 *   1. Show plan details + an optional coupon code field
 *   2. initiatePlanSubscription (validates coupon, creates Razorpay order,
 *      atomically inserts subscription+payment+redemption)
 *   3. Razorpay checkout
 *   4. confirmSubscriptionPayment → success state
 *
 * Mirrors ExtendBookingModal.tsx's structure/styling exactly.
 */

import { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle, Tag } from 'lucide-react'
import { useRazorpay } from '@/hooks/userazorpay'
import { initiatePlanSubscription, confirmSubscriptionPayment } from '@/lib/actions/students/student-subscriptions'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'

export type SubscribeModalPlan = {
  id:            string
  name:          string
  price:         number
  duration_days: number
  session_limit: string | null
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

type Stage = 'form' | 'processing' | 'success'

export function SubscribeModal({ plan, libraryId, libraryName, onClose }: SubscribeModalProps) {
  const { openCheckout } = useRazorpay()

  const [stage, setStage]       = useState<Stage>('form')
  const [couponCode, setCoupon] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [priceInfo, setPriceInfo] = useState<{ planPrice: number; discountAmount: number; platformFee: number; amount: number } | null>(null)

  async function handleSubscribe() {
    setError(null)
    setStage('processing')

    const res = await initiatePlanSubscription({
      planId:     plan.id,
      libraryId,
      couponCode: couponCode.trim() || undefined,
    })

    if (res.success === false) {
      setError(res.error)
      setStage('form')
      return
    }

    setPriceInfo({
      planPrice:      res.data.planPrice,
      discountAmount: res.data.discountAmount,
      platformFee:    res.data.platformFee,
      amount:         res.data.amount,
    })

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F8]">
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

          {stage === 'processing' && !priceInfo && (
            <div className="py-8 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#1E5CFF]" />
              <div className="text-[12px] text-[#9AACBE]">Setting up your subscription…</div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-[#C5282C] bg-[#FFF0F0] border border-[#FCA5A5] rounded-xl p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {stage === 'success' && (
            <div className="py-6 text-center space-y-3">
              <CheckCircle className="w-12 h-12 text-[#0D7C54] mx-auto" />
              <div className="text-[14px] font-bold text-[#0D1117]">You're subscribed!</div>
              <div className="text-[12px] text-[#6E7F94]">
                Your {plan.name} membership is now active.
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 rounded-xl bg-[#1E5CFF] text-white text-[13px] font-bold"
              >
                Done
              </button>
            </div>
          )}

          {stage === 'form' && (
            <>
              <div className="rounded-xl border border-[#E4EAF2] p-3.5 space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-[#6E7F94]">Plan price</span>
                  <span className="font-semibold text-[#0D1117]">₹{plan.price}</span>
                </div>
                <div className="flex justify-between text-[12px] text-[#9AACBE]">
                  <span>Duration</span>
                  <span>{plan.duration_days} days</span>
                </div>
                <div className="flex justify-between text-[12px] text-[#9AACBE]">
                  <span>Sessions</span>
                  <span>{plan.session_limit ?? 'Unlimited'}</span>
                </div>
                {plan.time_window_start && plan.time_window_end && (
                  <div className="flex justify-between text-[12px] text-[#92400E]">
                    <span>Valid hours</span>
                    <span className="font-semibold">{plan.time_window_start.slice(0, 5)}–{plan.time_window_end.slice(0, 5)} only</span>
                  </div>
                )}
                {describeDaysOfWeek(plan.days_of_week) && (
                  <div className="flex justify-between text-[12px] text-[#92400E]">
                    <span>Valid days</span>
                    <span className="font-semibold">{describeDaysOfWeek(plan.days_of_week)} only</span>
                  </div>
                )}
              </div>

              {(plan.time_window_start && plan.time_window_end) || describeDaysOfWeek(plan.days_of_week) ? (
                <div className="rounded-xl bg-[#FFF7ED] border border-[#FDE3C5] px-3.5 py-2.5 text-[11.5px] text-[#92400E]">
                  This plan only covers bookings{plan.time_window_start && plan.time_window_end ? ` between ${plan.time_window_start.slice(0, 5)} and ${plan.time_window_end.slice(0, 5)}` : ''}{describeDaysOfWeek(plan.days_of_week) ? ` on ${describeDaysOfWeek(plan.days_of_week)}` : ''}. Bookings outside that will be charged as regular paid seats.
                </div>
              ) : null}

              {/* Coupon code — optional, shared manually by the library owner */}
              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0D1117] mb-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Have a coupon code?
                </label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => setCoupon(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#DDE4EE] text-[13px] font-semibold tracking-wide outline-none focus:border-[#1E5CFF] transition-colors"
                  maxLength={40}
                />
                <div className="text-[10.5px] text-[#9AACBE] mt-1">
                  A 5% platform fee is added on top of the final price.
                </div>
              </div>

              <button
                onClick={handleSubscribe}
                disabled={stage as Stage === 'processing'}
                className="w-full py-3 rounded-xl bg-[#1E5CFF] text-white text-[13px] font-bold disabled:opacity-60"
              >
                {stage as Stage === 'processing' ? 'Please wait…' : 'Continue to payment'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
