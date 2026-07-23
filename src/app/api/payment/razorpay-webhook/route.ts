// app/api/payment/razorpay-webhook/route.ts
/**
 * Razorpay BOOKING PAYMENT webhook handler (escrow model).
 *
 * Configure in Razorpay Dashboard -> Webhooks:
 *   URL: https://yourdomain.com/api/payment/razorpay-webhook
 *   Events: payment.captured, payment.failed, refund.processed, refund.failed
 *   Secret: set RAZORPAY_WEBHOOK_SECRET env var to match
 *
 * PRODUCTION HARDENING (this revision):
 *   - True idempotency via the webhook_events ledger, keyed on Razorpay's
 *     x-razorpay-event-id header. Razorpay's own docs state the same event
 *     CAN be delivered more than once and delivery order is NOT guaranteed
 *     — this handler now tolerates both. The ledger INSERT has a unique
 *     constraint on (provider, external_event_id); a duplicate delivery
 *     fails that insert with Postgres error 23505 and the handler returns
 *     200 immediately without re-running any side effect.
 *   - A genuine processing failure now returns 5xx (not silently swallowed
 *     into a 200), so Razorpay's retry-with-backoff actually kicks in
 *     instead of the failure being invisible.
 *   - State transitions are validated before being applied (e.g. only
 *     'pending' -> 'paid', never blindly overwrite 'refunded' back to
 *     'paid' from an out-of-order replay).
 *   - Every transition is appended to financial_audit_log.
 *
 * This is a safety net — the client-side confirmation flow
 * (confirmBookingPayment / confirmBookingExtension in lib/actions/student.ts)
 * handles the happy path. This webhook catches edge cases where the user
 * closes the browser before the success callback fires, AND is the only
 * path that fires for payments made without a live client session at all.
 *
 * Uses the SERVICE-ROLE client (not the cookie-based anon client) because
 * this route runs with no logged-in user at all — there is no auth.uid()
 * for RLS to key off. See lib/supabase/service.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { Database } from '@/lib/supabase/types'
import { DEFAULT_COMMISSION_BPS } from '@/lib/booking/escrow'
import { recordWebhookEvent, markWebhookProcessed, markWebhookFailed } from '@/lib/webhooks/idempotency'
import { alerts } from '@/lib/alerts'
import { recomputePaymentAfterRefunds } from '@/lib/booking/refund-netting'
import { sendWhatsappNotification } from '@/lib/whatsapp/notify'
import { WA_TEMPLATES, refundProcessedParams } from '@/lib/whatsapp/templates'

// Payments.status is a Postgres enum (see payment_status in the schema) —
// using this alias instead of `string` keeps `.eq('status', currentStatus)`
// calls type-safe against the generated Supabase types below.
type PaymentStatus = NonNullable<Database['public']['Enums']['payment_status']>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVIDER = 'razorpay_payment'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''

  if (!secret) {
    console.error('[webhook:payment] RAZORPAY_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const rawBody = await req.text()

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    console.warn('[webhook:payment] Signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { event: string; payload: any }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Razorpay's de-dup header. Some test/manual deliveries may omit it — fall
  // back to a payload-derived synthetic id so we still get per-payment
  // dedup, just not cross-event-type dedup (acceptable degradation, never
  // silently skips real production traffic since the header is always
  // present on genuine Razorpay deliveries).
  const externalEventId =
    req.headers.get('x-razorpay-event-id') ??
    `synthetic:${event.event}:${event.payload?.payment?.entity?.id ?? 'unknown'}:${Date.now()}`

  const supabase = createServiceSupabaseClient()

  // ── Idempotency gate ────────────────────────────────────────────────────
  const ledgerResult = await recordWebhookEvent(supabase, {
    provider: PROVIDER,
    externalEventId,
    eventType: event.event,
    payload: event,
  })

  if (ledgerResult.alreadyProcessed) {
    // Either a true duplicate delivery, or a previous delivery is still
    // mid-flight (status='processing') and we don't want two concurrent
    // handlers racing on the same booking/payment. Acknowledge with 200 so
    // Razorpay doesn't keep retrying a duplicate — the original delivery
    // (or its retry) owns completing the work.
    console.log('[webhook:payment] Duplicate/in-flight event, skipping:', externalEventId)
    return NextResponse.json({ received: true, duplicate: true })
  }

  const webhookEventRowId = ledgerResult.webhookEventId

  try {
    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload?.payment?.entity
        if (!payment) break

        const orderId   = payment.order_id as string
        const paymentId = payment.id        as string

        const { data: payRecord, error: fetchErr } = await supabase
          .from('payments')
          .select('id, amount, base_amount, status, escrow_status, booking_id, subscription_id')
          .eq('razorpay_order_id', orderId)
          .maybeSingle()

        if (fetchErr) throw new Error(`Failed to fetch payment record: ${fetchErr.message}`)

        if (!payRecord) {
          // Genuinely unexpected — a captured payment with no matching
          // order on our side. Don't throw (that would retry forever for
          // an event we can never resolve); log loudly for manual triage
          // instead and mark this event completed-with-warning.
          console.error('[webhook:payment] CRITICAL: payment.captured for unknown order — possible missed booking or data loss:', orderId)
          break
        }

        const currentStatus = (payRecord as any).status as PaymentStatus

        if ((payRecord as any).booking_id) {
          // Booking payment: the booking (held->confirmed) and payment
          // (pending->paid, plus the escrow/commission split) transitions
          // both happen inside ONE atomic, service-role-only RPC — the
          // SAME function the client-confirm server action calls. This is
          // what makes the webhook and client paths unable to diverge or
          // race each other into an inconsistent state, and it's what
          // auto-flags a refund (instead of silently no-op'ing) if the
          // seat hold had already expired by the time this event arrived.
          const { data: result, error: rpcErr } = await supabase.rpc('confirm_booking_payment_captured', {
            p_booking_id: (payRecord as any).booking_id,
            p_expected_user_id: null,
            p_razorpay_order_id: orderId,
            p_razorpay_payment_id: paymentId,
            p_commission_bps: DEFAULT_COMMISSION_BPS,
            p_actor_type: 'webhook',
            p_actor_id: null,
            p_webhook_event_id: webhookEventRowId,
          } as never)

          if (rpcErr) throw new Error(`confirm_booking_payment_captured RPC failed: ${rpcErr.message}`)

          const r = result as any
          if (!r?.success && !r?.already_confirmed) {
            // Every failure branch inside the RPC that involves real money
            // already auto-raises a refund and logs a financial_audit_log
            // entry itself — this is just visibility in the webhook's own
            // logs/alerting, not a missed side effect.
            console.error('[webhook:payment] confirm_booking_payment_captured did not succeed:', r?.error, 'booking:', (payRecord as any).booking_id)
            await alerts.webhookProcessingFailed(supabase, PROVIDER, 'payment.captured.booking_confirm_failed', String(r?.error))
          }
          break
        }

        // Defensive state-machine guard: only 'pending' may transition to
        // 'paid' here. If it's already 'paid', this is a true duplicate
        // (idempotency ledger should have caught it, but defense in depth).
        // If it's 'refunded'/'failed', an out-of-order or replayed event is
        // trying to resurrect a payment we've since moved past — never let
        // that happen silently.
        if (currentStatus === 'paid') {
          console.log('[webhook:payment] payment.captured — already paid (defensive check), skipping:', payRecord.id)
          break
        }
        if (!['pending', 'failed'].includes(currentStatus)) {
          console.warn(`[webhook:payment] payment.captured received for payment ${payRecord.id} in unexpected status '${currentStatus}' — ignoring to avoid corrupting a later state (refund/etc). Manual review recommended.`)
          break
        }

        // Subscription payment (no booking_id) — unrelated to the seat-
        // booking escrow model (no held/eligible/paid_out lifecycle), but
        // owner_payout_amount/platform_commission_amount still need
        // settling from base_amount here, exactly like
        // confirmSubscriptionPayment does on the client-confirmed path.
        // Without this, a subscription confirmed via this webhook safety
        // net (rather than the client callback) would leave those columns
        // null, and lib/booking/revenue.ts falls back to the GROSS amount
        // (which includes the platform fee) as owner revenue — silently
        // overstating it. base_amount is null for pre-fee-on-top legacy
        // subscription rows (there are none going forward, but this stays
        // defensive for any payment created before this migration).
        const baseAmount = (payRecord as any).base_amount as number | null
        const grossAmount = Number((payRecord as any).amount ?? 0)
        const ownerPayoutAmount = baseAmount
        const platformCommissionAmount = baseAmount != null ? grossAmount - baseAmount : null

        const { error: updateErr } = await supabase
          .from('payments')
          .update({
            status: 'paid',
            razorpay_payment_id: paymentId,
            escrow_status: 'not_applicable',
            owner_payout_amount: ownerPayoutAmount,
            platform_commission_amount: platformCommissionAmount,
          } as never)
          .eq('id', (payRecord as any).id)
          .eq('status', currentStatus) // CAS guard: no-op if another process already moved it

        if (updateErr) throw new Error(`Failed to update payment ${payRecord.id}: ${updateErr.message}`)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payment',
          p_entity_id: (payRecord as any).id,
          p_event: 'captured',
          p_amount: Number((payRecord as any).amount ?? 0),
          p_previous_state: { status: currentStatus },
          p_new_state: { status: 'paid' },
          p_actor_type: 'webhook',
          p_webhook_event_id: webhookEventRowId,
          p_metadata: { razorpay_payment_id: paymentId, razorpay_order_id: orderId },
        })

        if ((payRecord as any).subscription_id) {
          await supabase
            .from('subscriptions')
            .update({ status: 'active' } as never)
            .eq('id', (payRecord as any).subscription_id)
            .eq('status', 'pending')
        }

        break
      }

      case 'payment.failed': {
        const payment = event.payload?.payment?.entity
        if (!payment) break

        const orderId = payment.order_id as string

        const { data: payRecord, error: fetchErr } = await supabase
          .from('payments')
          .select('id, status, booking_id')
          .eq('razorpay_order_id', orderId)
          .maybeSingle()

        if (fetchErr) throw new Error(`Failed to fetch payment record: ${fetchErr.message}`)
        if (!payRecord) break

        const currentStatus = (payRecord as any).status as PaymentStatus
        if (currentStatus === 'paid') {
          // A failed-then-captured-on-retry sequence can deliver out of
          // order. Never let a failed event downgrade an already-paid
          // payment — this is exactly the out-of-order delivery case
          // Razorpay's docs warn about.
          console.warn('[webhook:payment] payment.failed received for an already-paid payment (out-of-order delivery) — ignoring:', payRecord.id)
          break
        }

        await supabase
          .from('payments')
          .update({ status: 'failed' } as never)
          .eq('id', (payRecord as any).id)
          .eq('status', currentStatus)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payment',
          p_entity_id: (payRecord as any).id,
          p_event: 'failed',
          p_previous_state: { status: currentStatus },
          p_new_state: { status: 'failed' },
          p_actor_type: 'webhook',
          p_webhook_event_id: webhookEventRowId,
        })

        if ((payRecord as any).booking_id) {
          await supabase
            .from('bookings')
            .update({ status: 'cancelled' } as never)
            .eq('id', (payRecord as any).booking_id)
            .eq('status', 'held')
        }

        break
      }

      case 'refund.processed': {
        // Confirms a refund we already initiated (admin-refunds.ts sets it
        // to 'processing' right after the Razorpay API call succeeds) has
        // actually completed on Razorpay's side. Previously nothing ever
        // listened for this — every refund was permanently stuck at
        // 'processing' in the DB regardless of its real-world outcome.
        const refund = event.payload?.refund?.entity
        if (!refund) break
        const razorpayRefundId = refund.id as string

        const { data: refundRecord, error: fetchErr } = await supabase
          .from('refunds')
          .select('id, status, payment_id, amount, student_id, library_id')
          .eq('razorpay_refund_id', razorpayRefundId)
          .maybeSingle()

        if (fetchErr) throw new Error(`Failed to fetch refund record: ${fetchErr.message}`)
        if (!refundRecord) {
          console.warn('[webhook:payment] refund.processed for unknown razorpay_refund_id:', razorpayRefundId)
          break
        }
        if ((refundRecord as any).status === 'completed') break // already terminal, idempotent no-op

        await supabase
          .from('refunds')
          .update({ status: 'completed', completed_at: new Date().toISOString() } as never)
          .eq('id', (refundRecord as any).id)
          .eq('status', 'processing')

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'refund',
          p_entity_id: (refundRecord as any).id,
          p_event: 'refund_completed',
          p_actor_type: 'webhook',
          p_webhook_event_id: webhookEventRowId,
          p_metadata: { razorpay_refund_id: razorpayRefundId },
        })

        if ((refundRecord as any).student_id) {
          const { data: libRow } = await supabase
            .from('libraries').select('name').eq('id', (refundRecord as any).library_id).maybeSingle()
          const { data: studentRow } = await supabase
            .from('users').select('full_name').eq('id', (refundRecord as any).student_id).maybeSingle()

          void sendWhatsappNotification(supabase, {
            userId: (refundRecord as any).student_id,
            event: 'refund_processed',
            title: 'Refund processed',
            templateName: WA_TEMPLATES.REFUND_PROCESSED,
            templateParams: refundProcessedParams({
              studentName: (studentRow as any)?.full_name || 'there',
              amountRupees: Number((refundRecord as any).amount ?? 0),
              libraryName: (libRow as any)?.name ?? 'the library',
            }),
            libraryId: (refundRecord as any).library_id ?? null,
          })
        }

        break
      }

      case 'refund.failed': {
        // Razorpay confirming a refund we thought was 'processing' actually
        // failed on the bank/UPI side — without this handler this was
        // invisible; the DB would show 'processing' forever with no signal
        // to anyone that the student never actually got their money back.
        const refund = event.payload?.refund?.entity
        if (!refund) break
        const razorpayRefundId = refund.id as string

        const { data: refundRecord, error: fetchErr } = await supabase
          .from('refunds')
          .select('id, status, payment_id')
          .eq('razorpay_refund_id', razorpayRefundId)
          .maybeSingle()

        if (fetchErr) throw new Error(`Failed to fetch refund record: ${fetchErr.message}`)
        if (!refundRecord) {
          console.warn('[webhook:payment] refund.failed for unknown razorpay_refund_id:', razorpayRefundId)
          break
        }
        if (['completed', 'failed'].includes((refundRecord as any).status)) break // already terminal

        await supabase
          .from('refunds')
          .update({
            status: 'failed',
            failure_reason: refund.error_description ?? refund.status ?? 'Refund failed on Razorpay side (async, post-acceptance)',
          } as never)
          .eq('id', (refundRecord as any).id)
          .eq('status', 'processing')

        // CRITICAL: this refund never actually reached the student — the
        // bank/UPI rejected it. Revert payments.status/owner_payout_amount/
        // platform_commission_amount/escrow_status back to what they
        // should be with this refund excluded, using the exact same
        // shared computation initiateRefund used to apply it in the first
        // place (see lib/booking/refund-netting.ts). Without this, the
        // owner would stay silently shorted forever for a refund the
        // student never received — and the student's receipt would keep
        // showing "Refunded" for money nobody actually returned to them.
        if ((refundRecord as any).payment_id) {
          await recomputePaymentAfterRefunds(supabase, (refundRecord as any).payment_id)
        }

        // If this refund had also created a payout_clawback (i.e. the
        // owner's payout for this booking had already settled before the
        // refund was raised), that clawback is now based on a refund that
        // never happened either — waive it if it's still untouched, so
        // the owner's future payout isn't docked for nothing. If it's
        // already 'recovering'/'recovered' (money already deducted from a
        // real payout), that's a genuine manual-reversal situation — flag
        // it loudly rather than silently waiving after the fact.
        const { data: clawback } = await supabase
          .from('payout_clawbacks')
          .select('id, status, amount_owed')
          .eq('refund_id', (refundRecord as any).id)
          .maybeSingle()

        if (clawback && (clawback as any).status === 'pending') {
          await supabase
            .from('payout_clawbacks')
            .update({ status: 'waived', notes: `Waived — the refund this clawback was based on (refund ${(refundRecord as any).id}) failed on Razorpay's side and never actually reached the student.` } as never)
            .eq('id', (clawback as any).id)
            .eq('status', 'pending')
        } else if (clawback) {
          await alerts.webhookProcessingFailed(
            supabase, PROVIDER, 'refund.failed',
            `Refund ${razorpayRefundId} failed, but its linked clawback (${(clawback as any).id}) is already '${(clawback as any).status}' — money may already have been deducted from an owner's real payout for a refund that never happened. Needs manual admin reversal.`,
          )
        }

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'refund',
          p_entity_id: (refundRecord as any).id,
          p_event: 'refund_failed_async',
          p_actor_type: 'webhook',
          p_webhook_event_id: webhookEventRowId,
          p_metadata: { razorpay_refund_id: razorpayRefundId },
        })

        // This needs a human — the student is expecting money that hasn't
        // actually moved. Loud alert, not just a log line.
        await alerts.webhookProcessingFailed(supabase, PROVIDER, 'refund.failed', `Refund ${razorpayRefundId} failed asynchronously — needs manual admin follow-up`)
        break
      }

      default:
        console.log('[webhook:payment] Unhandled event type:', event.event)
        break
    }

    await markWebhookProcessed(supabase, webhookEventRowId)
    return NextResponse.json({ received: true })
  } catch (err: any) {
    // A genuine failure: mark it in the ledger (so it's visible as a
    // dead-letter candidate for retry/triage) AND return a 5xx so Razorpay
    // actually retries per its documented exponential backoff, instead of
    // the previous behavior of swallowing the error and returning 200
    // (which told Razorpay delivery succeeded when it had not).
    console.error('[webhook:payment] Handler error:', err)
    await markWebhookFailed(supabase, webhookEventRowId, err?.message ?? String(err))
    await alerts.webhookProcessingFailed(supabase, PROVIDER, event.event, err?.message ?? String(err))
    return NextResponse.json({ error: 'Processing failed, will retry' }, { status: 500 })
  }
}
