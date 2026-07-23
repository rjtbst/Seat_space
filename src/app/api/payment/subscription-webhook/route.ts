// app/api/payment/subscription-webhook/route.ts
/**
 * Razorpay PLATFORM SUBSCRIPTION webhook handler.
 *
 * Handles the lifecycle of the owner's Rs.399/mo per-library platform
 * subscription, billed via Razorpay's Subscriptions API with a UPI AutoPay
 * (or card) mandate.
 *
 * Configure in Razorpay Dashboard -> Webhooks:
 *   URL: https://yourdomain.com/api/payment/subscription-webhook
 *   Events: subscription.authenticated, subscription.activated,
 *           subscription.charged, subscription.pending, subscription.halted,
 *           subscription.cancelled, subscription.completed
 *   Secret: set RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET env var to match
 *
 * PRODUCTION HARDENING (this revision):
 *   - True idempotency via the webhook_events ledger (see lib/webhooks/idempotency.ts).
 *     This matters MORE here than on the payment webhook: subscription.charged
 *     performs an INSERT (a new platform_subscription_payments row) on every
 *     delivery. Without dedup, a single Razorpay retry would create a
 *     second billing-history row and double-notify the owner with no
 *     natural "already paid" state to catch it, unlike the payments table.
 *   - A defense-in-depth partial unique index on
 *     platform_subscription_payments.razorpay_payment_id also exists at
 *     the DB layer (see migration) in case this code path is ever called
 *     from somewhere other than this handler.
 *   - Every transition is appended to financial_audit_log.
 *   - Failures return 5xx so Razorpay's retry/backoff is actually exercised.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { recordWebhookEvent, markWebhookProcessed, markWebhookFailed } from '@/lib/webhooks/idempotency'
import { alerts } from '@/lib/alerts'
import { sendWhatsappNotification } from '@/lib/whatsapp/notify'
import { WA_TEMPLATES, subscriptionPaymentFailedParams } from '@/lib/whatsapp/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GRACE_PERIOD_DAYS = 5
const PROVIDER = 'razorpay_subscription'

async function notifyOwner(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  ownerId: string,
  libraryId: string,
  event: string,
  title: string,
  body: string,
) {
  try {
    await (supabase as any).rpc('notify_user', {
      p_user_id: ownerId,
      p_event: event,
      p_title: title,
      p_body: body,
      p_payload: {},
      p_library_id: libraryId,
      p_booking_id: null,
    })
  } catch (e) {
    console.warn('[webhook:subscription] notify_user failed:', e)
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const secret     = process.env.RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET
    ?? process.env.RAZORPAY_WEBHOOK_SECRET
    ?? ''

  if (!secret) {
    console.error('[webhook:subscription] No webhook secret configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const rawBody = await req.text()

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    console.warn('[webhook:subscription] Signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { event: string; payload: any }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const externalEventId =
    req.headers.get('x-razorpay-event-id') ??
    `synthetic:${event.event}:${event.payload?.subscription?.entity?.id ?? 'unknown'}:${Date.now()}`

  const supabase = createServiceSupabaseClient()

  const ledgerResult = await recordWebhookEvent(supabase, {
    provider: PROVIDER,
    externalEventId,
    eventType: event.event,
    payload: event,
  })

  if (ledgerResult.alreadyProcessed) {
    console.log('[webhook:subscription] Duplicate/in-flight event, skipping:', externalEventId)
    return NextResponse.json({ received: true, duplicate: true })
  }

  const webhookEventRowId = ledgerResult.webhookEventId

  try {
    const razorpaySubId = event.payload?.subscription?.entity?.id as string | undefined

    if (!razorpaySubId) {
      console.log('[webhook:subscription] No subscription entity in payload, event:', event.event)
      await markWebhookProcessed(supabase, webhookEventRowId)
      return NextResponse.json({ received: true })
    }

    const { data: sub, error: fetchErr } = await supabase
      .from('platform_subscriptions')
      .select('id, library_id, owner_id, status, failed_charge_count')
      .eq('razorpay_subscription_id', razorpaySubId)
      .maybeSingle()

    if (fetchErr) throw new Error(`Failed to fetch subscription: ${fetchErr.message}`)

    if (!sub) {
      console.warn('[webhook:subscription] No local subscription for Razorpay sub:', razorpaySubId)
      await markWebhookProcessed(supabase, webhookEventRowId)
      return NextResponse.json({ received: true })
    }

    const libraryId = (sub as any).library_id as string
    const ownerId   = (sub as any).owner_id as string
    const subId     = (sub as any).id as string
    const prevStatus = (sub as any).status as string

    switch (event.event) {
      case 'subscription.authenticated':
      case 'subscription.activated': {
        const subEntity = event.payload.subscription.entity
        await supabase
          .from('platform_subscriptions')
          .update({
            status: 'active',
            current_period_start: subEntity.current_start ? new Date(subEntity.current_start * 1000).toISOString() : null,
            current_period_end:   subEntity.current_end   ? new Date(subEntity.current_end   * 1000).toISOString() : null,
            next_billing_at:      subEntity.charge_at     ? new Date(subEntity.charge_at      * 1000).toISOString() : null,
            failed_charge_count: 0,
            grace_period_ends_at: null,
          } as never)
          .eq('id', subId)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'platform_subscription', p_entity_id: subId, p_event: 'activated',
          p_previous_state: { status: prevStatus }, p_new_state: { status: 'active' },
          p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
        })

        await notifyOwner(supabase, ownerId, libraryId, 'subscription_activated',
          'Subscription activated',
          'Your Rs.399/month platform subscription is now active. Your library can go live once approved by the platform admin.')

        console.log('[webhook:subscription] Subscription activated:', razorpaySubId)
        break
      }

      case 'subscription.charged': {
        const subEntity = event.payload.subscription.entity
        const paymentEntity = event.payload.payment?.entity

        await supabase
          .from('platform_subscriptions')
          .update({
            status: 'active',
            current_period_start: subEntity.current_start ? new Date(subEntity.current_start * 1000).toISOString() : null,
            current_period_end:   subEntity.current_end   ? new Date(subEntity.current_end   * 1000).toISOString() : null,
            next_billing_at:      subEntity.charge_at     ? new Date(subEntity.charge_at      * 1000).toISOString() : null,
            failed_charge_count: 0,
            grace_period_ends_at: null,
          } as never)
          .eq('id', subId)

        const { error: insertErr } = await supabase.from('platform_subscription_payments').insert({
          platform_subscription_id: subId,
          library_id: libraryId,
          owner_id: ownerId,
          status: 'captured',
          amount_paise: paymentEntity?.amount ?? 39900,
          razorpay_payment_id: paymentEntity?.id ?? null,
          razorpay_invoice_id: event.payload.invoice?.entity?.id ?? null,
          billing_period_start: subEntity.current_start ? new Date(subEntity.current_start * 1000).toISOString() : null,
          billing_period_end:   subEntity.current_end   ? new Date(subEntity.current_end   * 1000).toISOString() : null,
          is_retry: false,
          retry_attempt: 0,
        } as never)

        // 23505 here means the defense-in-depth unique index on
        // razorpay_payment_id caught a duplicate that somehow got past the
        // webhook_events ledger gate (e.g. a manually replayed event with a
        // different event id but the same underlying payment). Treat as
        // already-handled, not a failure.
        if (insertErr && (insertErr as any).code !== '23505') {
          throw new Error(`Failed to insert subscription payment record: ${insertErr.message}`)
        }

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'platform_subscription', p_entity_id: subId, p_event: 'charged',
          p_amount: (paymentEntity?.amount ?? 39900) / 100,
          p_previous_state: { status: prevStatus }, p_new_state: { status: 'active' },
          p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
          p_metadata: { razorpay_payment_id: paymentEntity?.id ?? null },
        })

        await notifyOwner(supabase, ownerId, libraryId, 'subscription_renewed',
          'Subscription renewed',
          'Rs.399 was charged for this month\'s platform subscription. Your library stays live.')

        console.log('[webhook:subscription] Subscription charged (renewal):', razorpaySubId)
        break
      }

      case 'subscription.pending': {
        const newFailedCount = ((sub as any).failed_charge_count ?? 0) + 1
        const graceEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000).toISOString()

        await supabase
          .from('platform_subscriptions')
          .update({
            status: 'past_due',
            failed_charge_count: newFailedCount,
            grace_period_ends_at: graceEnd,
          } as never)
          .eq('id', subId)

        await supabase.from('platform_subscription_payments').insert({
          platform_subscription_id: subId,
          library_id: libraryId,
          owner_id: ownerId,
          status: 'failed',
          amount_paise: 39900,
          is_retry: newFailedCount > 1,
          retry_attempt: newFailedCount,
          failure_reason: 'Razorpay subscription.pending - charge attempt failed, retry scheduled',
        } as never)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'platform_subscription', p_entity_id: subId, p_event: 'charge_failed',
          p_previous_state: { status: prevStatus }, p_new_state: { status: 'past_due' },
          p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
          p_metadata: { failed_charge_count: newFailedCount },
        })

        await notifyOwner(supabase, ownerId, libraryId, 'subscription_payment_failed',
          'Subscription payment failed',
          `We couldn't charge Rs.399 for your platform subscription. Please ensure your AutoPay mandate is funded - you have ${GRACE_PERIOD_DAYS} days before your library is taken offline.`)

        // WhatsApp — arguably the single highest-value notification in
        // the whole plan: an owner who misses this in-app and doesn't
        // fix their AutoPay mandate within the grace period has their
        // library taken offline.
        {
          const { data: ownerRow } = await supabase.from('users').select('full_name').eq('id', ownerId).maybeSingle()
          const { data: libRow } = await supabase.from('libraries').select('name').eq('id', libraryId).maybeSingle()

          void sendWhatsappNotification(supabase, {
            userId: ownerId,
            event: 'subscription_payment_failed',
            title: 'Subscription payment failed',
            templateName: WA_TEMPLATES.SUBSCRIPTION_PAYMENT_FAILED,
            templateParams: subscriptionPaymentFailedParams({
              ownerName: (ownerRow as any)?.full_name || 'there',
              amountRupees: 399,
              libraryName: (libRow as any)?.name ?? 'your library',
            }),
            libraryId,
          })
        }

        console.log('[webhook:subscription] Subscription pending (charge failed, retrying):', razorpaySubId)
        break
      }

      case 'subscription.halted': {
        await supabase
          .from('platform_subscriptions')
          .update({ status: 'halted', grace_period_ends_at: new Date().toISOString() } as never)
          .eq('id', subId)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'platform_subscription', p_entity_id: subId, p_event: 'halted',
          p_previous_state: { status: prevStatus }, p_new_state: { status: 'halted' },
          p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
        })

        await notifyOwner(supabase, ownerId, libraryId, 'subscription_halted',
          'Subscription halted - library offline',
          'Your platform subscription payment retries were exhausted. Your library has been taken offline. Set up a new subscription to go live again.')

        console.log('[webhook:subscription] Subscription halted:', razorpaySubId)
        break
      }

      case 'subscription.cancelled': {
        await supabase
          .from('platform_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() } as never)
          .eq('id', subId)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'platform_subscription', p_entity_id: subId, p_event: 'cancelled',
          p_previous_state: { status: prevStatus }, p_new_state: { status: 'cancelled' },
          p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
        })

        await notifyOwner(supabase, ownerId, libraryId, 'subscription_cancelled',
          'Subscription cancelled',
          'Your platform subscription has been cancelled. Your library will go offline at the end of the current billing period.')

        console.log('[webhook:subscription] Subscription cancelled:', razorpaySubId)
        break
      }

      case 'subscription.completed': {
        await supabase
          .from('platform_subscriptions')
          .update({ status: 'expired' } as never)
          .eq('id', subId)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'platform_subscription', p_entity_id: subId, p_event: 'completed',
          p_previous_state: { status: prevStatus }, p_new_state: { status: 'expired' },
          p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
        })

        console.log('[webhook:subscription] Subscription completed (reached end):', razorpaySubId)
        break
      }

      default:
        console.log('[webhook:subscription] Unhandled event type:', event.event)
        break
    }

    await markWebhookProcessed(supabase, webhookEventRowId)
    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[webhook:subscription] Handler error:', err)
    await markWebhookFailed(supabase, webhookEventRowId, err?.message ?? String(err))
    await alerts.webhookProcessingFailed(supabase, PROVIDER, event.event, err?.message ?? String(err))
    return NextResponse.json({ error: 'Processing failed, will retry' }, { status: 500 })
  }
}
