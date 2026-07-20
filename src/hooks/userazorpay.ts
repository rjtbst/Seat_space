// hooks/useRazorpay.ts
'use client'

import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    Razorpay: any
  }
}

const SCRIPT_ID = 'razorpay-sdk'

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (document.getElementById(SCRIPT_ID)) return resolve(true)

    const script  = document.createElement('script')
    script.id     = SCRIPT_ID
    script.src    = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async  = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

export type RazorpayPaymentOptions = {
  orderId:   string
  keyId:     string
  amount:    number       // INR (we convert to paise internally)
  name:      string
  description?: string
  prefill?: {
    name?:  string
    email?: string
    phone?: string
  }
  onSuccess: (paymentId: string, orderId: string, signature: string) => void
  onDismiss: () => void
  onError:   (error: string) => void
}

export function useRazorpay() {
  const loaded = useRef(false)

  useEffect(() => {
    loadScript().then((ok) => { loaded.current = ok })
  }, [])

  const openCheckout = useCallback(async (opts: RazorpayPaymentOptions) => {
    const ok = loaded.current || await loadScript()
    if (!ok || !window.Razorpay) {
      opts.onError('Payment gateway failed to load. Please check your connection.')
      return
    }

    const rzp = new window.Razorpay({
      key:         opts.keyId,
      amount:      opts.amount * 100,   // paise
      currency:    'INR',
      name:        opts.name,
      description: opts.description ?? 'Seat Booking',
      order_id:    opts.orderId,
      prefill: {
        name:    opts.prefill?.name  ?? '',
        email:   opts.prefill?.email ?? '',
        contact: opts.prefill?.phone ?? '',
      },
      theme: { color: '#1246FF' },
      modal: {
        ondismiss: opts.onDismiss,
        escape:    true,
        animation: true,
      },
      handler: (response: {
        razorpay_payment_id: string
        razorpay_order_id:   string
        razorpay_signature:  string
      }) => {
        opts.onSuccess(
          response.razorpay_payment_id,
          response.razorpay_order_id,
          response.razorpay_signature,
        )
      },
    })

    rzp.on('payment.failed', (response: { error: { description: string } }) => {
      opts.onError(response.error?.description ?? 'Payment failed')
    })

    rzp.open()
  }, [])

  return { openCheckout }
}

/* ─── Subscription (mandate authorization) checkout ──────────────────────
 * Separate from openCheckout above because Razorpay's Subscriptions flow
 * takes `subscription_id` instead of `order_id` + `amount`, and the
 * success handler returns razorpay_subscription_id instead of
 * razorpay_order_id. Used to authorize the owner's UPI AutoPay/card mandate
 * in-page, instead of redirecting to the hosted short_url page (which can
 * 404 with "Hosted page is not available" on accounts pending full
 * Razorpay activation, even in test mode). */

export type RazorpaySubscriptionCheckoutOptions = {
  subscriptionId: string
  keyId: string
  name: string
  description?: string
  prefill?: {
    name?: string
    email?: string
    phone?: string
  }
  onSuccess: (paymentId: string, subscriptionId: string, signature: string) => void
  onDismiss: () => void
  onError: (error: string) => void
}

export function useRazorpaySubscriptionCheckout() {
  const loaded = useRef(false)

  useEffect(() => {
    loadScript().then((ok) => { loaded.current = ok })
  }, [])

  const openSubscriptionCheckout = useCallback(async (opts: RazorpaySubscriptionCheckoutOptions) => {
    const ok = loaded.current || await loadScript()
    if (!ok || !window.Razorpay) {
      opts.onError('Payment gateway failed to load. Please check your connection.')
      return
    }

    const rzp = new window.Razorpay({
      key:             opts.keyId,
      subscription_id: opts.subscriptionId,
      name:            opts.name,
      description:     opts.description ?? 'Platform subscription — ₹399/month',
      prefill: {
        name:    opts.prefill?.name  ?? '',
        email:   opts.prefill?.email ?? '',
        contact: opts.prefill?.phone ?? '',
      },
      theme: { color: '#0D7C54' },
      modal: {
        ondismiss: opts.onDismiss,
        escape:    true,
        animation: true,
      },
      handler: (response: {
        razorpay_payment_id:      string
        razorpay_subscription_id: string
        razorpay_signature:       string
      }) => {
        opts.onSuccess(
          response.razorpay_payment_id,
          response.razorpay_subscription_id,
          response.razorpay_signature,
        )
      },
    })

    rzp.on('payment.failed', (response: { error: { description: string } }) => {
      opts.onError(response.error?.description ?? 'Payment failed')
    })

    rzp.open()
  }, [])

  return { openSubscriptionCheckout }
}