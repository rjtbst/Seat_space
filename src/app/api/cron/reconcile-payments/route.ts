// app/api/cron/reconcile-payments/route.ts
//
// Reconciliation job for stuck 'pending' booking payments — closes the gap
// where a payment could be captured on Razorpay's side but never reflected
// on ours (e.g. the client tab closed before confirmBookingPayment ran, AND
// the payment.captured webhook delivery was somehow lost/never configured
// for a period). Runs independently of both the client-confirm path and
// the webhook, checking directly against Razorpay's own Payments API.
//
// Vercel crons (vercel.json):
//   { "crons": [{ "path": "/api/cron/reconcile-payments", "schedule": "*/15 * * * *" }] }
//
// Or external cron:
//   GET https://yourdomain.com/api/cron/reconcile-payments
//   Authorization: Bearer YOUR_CRON_SECRET
//
// ENV: CRON_SECRET

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { fetchRazorpayOrderPayments } from '@/lib/razorpay/server'
import { DEFAULT_COMMISSION_BPS } from '@/lib/booking/escrow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authHeader  = req.headers.get('authorization') ?? ''
    const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
    const cronSecret  = process.env.CRON_SECRET ?? ''

    const authorized =
      cronSecret !== '' &&
      (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret)

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createServiceSupabaseClient()
  const results: Array<{ paymentId: string; action: string; detail?: string }> = []

  try {
    const { data: stuck, error } = await (supabase as any).rpc('find_stuck_pending_payments', {
      p_older_than: '30 minutes',
    })
    if (error) throw new Error(`find_stuck_pending_payments failed: ${error.message}`)

    for (const row of (stuck ?? []) as any[]) {
      if (!row.razorpay_order_id) continue

      const orderPayments = await fetchRazorpayOrderPayments(row.razorpay_order_id)
      if (orderPayments.success === false) {
        results.push({ paymentId: row.payment_id, action: 'skip', detail: orderPayments.error })
        continue
      }

      const captured = orderPayments.data.find((p: { captured: boolean; status: string }) => p.captured && p.status === 'captured')
      const failed   = orderPayments.data.length > 0 && orderPayments.data.every((p: { status: string }) => p.status === 'failed')

      if (captured) {
        // Razorpay shows this order as genuinely paid but our side never
        // recorded it — drive it through the exact same atomic function
        // the webhook and client-confirm path use, so it ends up in
        // precisely the same consistent state (or auto-flags a refund if
        // the booking/hold has since moved on).
        const { data: result, error: rpcErr } = await (supabase as any).rpc('confirm_booking_payment_captured', {
          p_booking_id: row.booking_id,
          p_expected_user_id: null,
          p_razorpay_order_id: row.razorpay_order_id,
          p_razorpay_payment_id: captured.id,
          p_commission_bps: DEFAULT_COMMISSION_BPS,
          p_actor_type: 'reconciliation_cron',
          p_actor_id: null,
        })
        results.push({
          paymentId: row.payment_id,
          action: rpcErr ? 'error' : ((result as any)?.success ? 'reconciled_confirmed' : 'reconciled_but_flagged'),
          detail: rpcErr?.message ?? (result as any)?.error,
        })
      } else if (failed) {
        await supabase
          .from('payments')
          .update({ status: 'failed' } as never)
          .eq('id', row.payment_id)
          .eq('status', 'pending')
        results.push({ paymentId: row.payment_id, action: 'marked_failed' })
      } else {
        // No captured or failed payment on Razorpay's side at all — this is
        // a genuinely abandoned checkout. Leave it; the seat-hold expiry
        // sweep will cancel the booking on its own normal schedule, and
        // this payment will simply age out as 'pending' on a 'cancelled'
        // booking, which is harmless (no money was ever taken).
        results.push({ paymentId: row.payment_id, action: 'no_op_still_uncaptured' })
      }
    }

    return NextResponse.json({ ok: true, checked: results.length, results, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[cron:reconcile-payments] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
