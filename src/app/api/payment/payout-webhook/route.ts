// app/api/payment/payout-webhook/route.ts
/**
 * RazorpayX PAYOUT webhook handler.
 *
 * This closes the biggest open gap from the production audit: a payout
 * was previously marked 'processing' once RazorpayX accepted the request
 * and NEVER updated again — there was no automatic confirmation that money
 * actually reached the owner, or that it failed/reversed.
 *
 * Configure in Razorpay Dashboard -> Webhooks (RazorpayX webhooks are
 * configured separately under the X/Payouts section):
 *   URL: https://yourdomain.com/api/payment/payout-webhook
 *   Events: payout.processed, payout.failed, payout.reversed, payout.updated
 *   Secret: set RAZORPAYX_PAYOUT_WEBHOOK_SECRET env var to match
 *
 * Per Razorpay's own documentation:
 *   - payout.processed and payout.reversed are the TERMINAL states.
 *   - HOWEVER: a payout already in 'processed' state can still move to
 *     'reversed' within T+3 working days in rare cases (the beneficiary
 *     bank later rejects the credit) — this handler does NOT assume
 *     'processed' is forever immutable.
 *   - Delivery order is not guaranteed.
 *   - payout.updated fires on intermediate detail changes (e.g. UTR
 *     received) and does not change payout state by itself.
 *
 * Uses the same idempotency ledger (webhook_events) as the other two
 * webhooks, and the same service-role client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { recordWebhookEvent, markWebhookProcessed, markWebhookFailed } from '@/lib/webhooks/idempotency'
import { alerts, raiseAlert } from '@/lib/alerts'
import { sendWhatsappNotification } from '@/lib/whatsapp/notify'
import { WA_TEMPLATES, payoutProcessedParams } from '@/lib/whatsapp/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVIDER = 'razorpay_payout'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const secret = process.env.RAZORPAYX_PAYOUT_WEBHOOK_SECRET
    ?? process.env.RAZORPAY_WEBHOOK_SECRET
    ?? ''

  if (!secret) {
    console.error('[webhook:payout] No webhook secret configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const rawBody = await req.text()

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    console.warn('[webhook:payout] Signature verification failed')
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
    `synthetic:${event.event}:${event.payload?.payout?.entity?.id ?? 'unknown'}:${Date.now()}`

  const supabase = createServiceSupabaseClient()

  const ledgerResult = await recordWebhookEvent(supabase, {
    provider: PROVIDER,
    externalEventId,
    eventType: event.event,
    payload: event,
  })

  if (ledgerResult.alreadyProcessed) {
    console.log('[webhook:payout] Duplicate/in-flight event, skipping:', externalEventId)
    return NextResponse.json({ received: true, duplicate: true })
  }

  const webhookEventRowId = ledgerResult.webhookEventId

  try {
    const payoutEntity = event.payload?.payout?.entity
    const razorpayPayoutId = payoutEntity?.id as string | undefined

    if (!razorpayPayoutId) {
      console.log('[webhook:payout] No payout entity in payload, event:', event.event)
      await markWebhookProcessed(supabase, webhookEventRowId)
      return NextResponse.json({ received: true })
    }

    const { data: payout, error: fetchErr } = await supabase
      .from('payouts')
      .select('id, status, owner_id, net_amount_paise, payment_id, library_id')
      .eq('razorpay_payout_id', razorpayPayoutId)
      .maybeSingle()

    if (fetchErr) throw new Error(`Failed to fetch payout: ${fetchErr.message}`)

    if (!payout) {
      console.warn('[webhook:payout] No local payout for Razorpay payout:', razorpayPayoutId)
      await markWebhookProcessed(supabase, webhookEventRowId)
      return NextResponse.json({ received: true })
    }

    const payoutId = (payout as any).id as string
    const prevStatus = (payout as any).status as string
    const ownerId = (payout as any).owner_id as string
    const netAmountRupees = ((payout as any).net_amount_paise ?? 0) / 100

    switch (event.event) {
      case 'payout.processed': {
        if (prevStatus === 'completed') {
          console.log('[webhook:payout] Already completed, skipping:', payoutId)
          break
        }

        await supabase
          .from('payouts')
          .update({
            status: 'completed',
            utr: payoutEntity.utr ?? null,
            last_webhook_event_id: webhookEventRowId,
          } as never)
          .eq('id', payoutId)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payout', p_entity_id: payoutId, p_event: 'payout_completed',
          p_amount: netAmountRupees, p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
          p_metadata: { utr: payoutEntity.utr ?? null },
        })

        console.log('[webhook:payout] Payout completed:', razorpayPayoutId)

        {
          const { data: ownerRow } = await supabase.from('users').select('full_name').eq('id', ownerId).maybeSingle()

          void sendWhatsappNotification(supabase, {
            userId: ownerId,
            event: 'payout_processed',
            title: 'Payout received',
            templateName: WA_TEMPLATES.PAYOUT_PROCESSED,
            templateParams: payoutProcessedParams({
              ownerName: (ownerRow as any)?.full_name || 'there',
              amountRupees: netAmountRupees,
              utr: payoutEntity.utr ?? '',
            }),
            libraryId: (payout as any).library_id ?? null,
          })
        }

        break
      }

      case 'payout.failed': {
        if (prevStatus === 'completed') {
          await raiseAlert(supabase, {
            severity: 'warning',
            source: 'payout-webhook',
            title: 'payout.failed received for an already-completed payout',
            message: `Payout ${payoutId} received a failed event after already being marked completed. Ignored — investigate the Razorpay dashboard for this payout.`,
            metadata: { payoutId, razorpayPayoutId },
          })
          break
        }

        await supabase
          .from('payouts')
          .update({
            status: 'failed',
            failure_reason: payoutEntity.failure_reason ?? payoutEntity.status_details?.description ?? 'Payout failed',
            last_webhook_event_id: webhookEventRowId,
          } as never)
          .eq('id', payoutId)

        // A failed payout means the owner was NEVER paid — release the
        // escrow back to 'eligible' so the next sweep retries it. (This
        // differs from a reversal below, which means they WERE paid and
        // the bank later clawed it back.)
        if ((payout as any).payment_id) {
          await supabase
            .from('payments')
            .update({ escrow_status: 'eligible' } as never)
            .eq('id', (payout as any).payment_id)
            .eq('escrow_status', 'paid_out')
        }

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payout', p_entity_id: payoutId, p_event: 'payout_failed_confirmed',
          p_amount: netAmountRupees, p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
          p_metadata: { failure_reason: payoutEntity.failure_reason ?? null },
        })

        await alerts.payoutFailed(supabase, payoutId, payoutEntity.failure_reason ?? 'Unknown reason', netAmountRupees)

        console.log('[webhook:payout] Payout failed (confirmed):', razorpayPayoutId)
        break
      }

      case 'payout.reversed': {
        // The rare T+3-day case: a payout that had ALREADY completed is
        // now reversed by the beneficiary bank. The owner never actually
        // kept the money. Record via payout_clawbacks (refund_id NULL,
        // since this wasn't triggered by a student refund) and flip
        // escrow back to eligible so the booking's payout can be
        // re-attempted.
        await supabase
          .from('payouts')
          .update({
            status: 'reversed',
            reversed_at: new Date().toISOString(),
            reversal_reason: payoutEntity.failure_reason ?? payoutEntity.status_details?.description ?? 'Reversed by beneficiary bank',
            last_webhook_event_id: webhookEventRowId,
          } as never)
          .eq('id', payoutId)

        if ((payout as any).payment_id) {
          await supabase
            .from('payments')
            .update({ escrow_status: 'eligible' } as never)
            .eq('id', (payout as any).payment_id)
        }

        await supabase.from('payout_clawbacks').insert({
          owner_id: ownerId,
          refund_id: null,
          original_payout_id: payoutId,
          amount_owed: netAmountRupees,
          status: 'pending',
          notes: `Auto-created: payout ${payoutId} was reversed by the beneficiary bank after completing — funds never actually reached the owner. Escrow was reset to 'eligible' for re-payout; this clawback record exists primarily to flag the anomaly for admin review.`,
        } as never)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payout', p_entity_id: payoutId, p_event: 'payout_reversed',
          p_amount: netAmountRupees, p_actor_type: 'webhook', p_webhook_event_id: webhookEventRowId,
        })

        await alerts.payoutReversed(supabase, payoutId, ownerId, netAmountRupees)

        console.log('[webhook:payout] Payout reversed (post-completion anomaly):', razorpayPayoutId)
        break
      }

      case 'payout.updated': {
        if (payoutEntity.utr) {
          await supabase.from('payouts').update({ utr: payoutEntity.utr } as never).eq('id', payoutId)
        }
        break
      }

      default:
        console.log('[webhook:payout] Unhandled event type:', event.event)
        break
    }

    await markWebhookProcessed(supabase, webhookEventRowId)
    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[webhook:payout] Handler error:', err)
    await markWebhookFailed(supabase, webhookEventRowId, err?.message ?? String(err))
    await alerts.webhookProcessingFailed(supabase, PROVIDER, event.event, err?.message ?? String(err))
    return NextResponse.json({ error: 'Processing failed, will retry' }, { status: 500 })
  }
}
