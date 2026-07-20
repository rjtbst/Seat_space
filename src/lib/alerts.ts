// lib/alerts.ts
/**
 * Production alerting.
 *
 * Design: write to `alert_log` FIRST (durable, queryable, survives even if
 * the delivery channel is completely down), THEN attempt delivery via
 * Upstash Redis as a lightweight queue feeding a Slack webhook. This order
 * matters — an alert about a payout failure is itself important data even
 * if Slack never sees it; querying `alert_log` for delivery_status !=
 * 'delivered' is the fallback when the notification channel itself is the
 * thing that's broken.
 *
 * Why Upstash Redis as the queue (not calling Slack directly inline):
 *   - Calling a third-party webhook synchronously inside a payment/payout
 *     webhook handler couples your critical path's latency/availability to
 *     Slack's. If Slack is slow or down, that should never slow down or
 *     fail YOUR webhook processing.
 *   - Upstash's REST API works from any serverless runtime with a plain
 *     fetch() call — no persistent connection, no new heavy SDK dependency.
 *   - A separate consumer (cron-triggered, see app/api/cron/flush-alerts)
 *     drains the queue and performs the actual Slack delivery, with retry
 *     and dead-letter tracking via alert_log.delivery_status independent
 *     of whatever triggered the alert in the first place.
 *
 * ENV VARS
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   SLACK_ALERT_WEBHOOK_URL   — Slack "Incoming Webhook" URL for the alerts channel
 *
 * If Upstash/Slack env vars are not configured, alerts still get recorded
 * in `alert_log` (so nothing is silently lost) but delivery is skipped —
 * this is deliberate graceful degradation, not a hard dependency.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL ?? ''
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''
const ALERT_QUEUE_KEY = 'alerts:outbox'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export type RaiseAlertParams = {
  severity: AlertSeverity
  source: string
  title: string
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Records an alert durably and enqueues it for delivery. Never throws —
 * a failure to alert must not become a failure of the calling webhook/cron
 * handler.
 */
export async function raiseAlert(
  supabase: SupabaseClient<any>,
  params: RaiseAlertParams,
): Promise<string | null> {
  let alertId: string | null = null

  try {
    const { data, error } = await supabase
      .from('alert_log')
      .insert({
        severity: params.severity,
        source: params.source,
        title: params.title,
        message: params.message,
        metadata: params.metadata ?? {},
        delivery_status: 'pending',
      } as never)
      .select('id')
      .single()

    if (error) {
      console.error('[alerts] Failed to write alert_log row:', error.message, params)
    } else {
      alertId = (data as any).id
    }
  } catch (err) {
    console.error('[alerts] Unexpected error writing alert_log:', err, params)
  }

  if (alertId && UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      await fetch(`${UPSTASH_URL}/rpush/${ALERT_QUEUE_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([JSON.stringify({ alertId, ...params })]),
      })
    } catch (err) {
      console.error('[alerts] Failed to enqueue alert for delivery:', err)
    }
  } else if (alertId && (!UPSTASH_URL || !UPSTASH_TOKEN)) {
    console.warn('[alerts] Upstash not configured — alert recorded in alert_log but not queued for delivery:', params.title)
  }

  if (params.severity === 'critical') {
    console.error(`[ALERT:CRITICAL] ${params.source} — ${params.title}: ${params.message}`, params.metadata ?? {})
  }

  return alertId
}

/** Convenience wrappers for the common cases this codebase actually raises. */
export const alerts = {
  webhookProcessingFailed: (supabase: SupabaseClient<any>, provider: string, eventType: string, error: string) =>
    raiseAlert(supabase, {
      severity: 'critical',
      source: `webhook:${provider}`,
      title: `Webhook processing failed: ${eventType}`,
      message: error,
      metadata: { provider, eventType },
    }),

  payoutFailed: (supabase: SupabaseClient<any>, payoutId: string, reason: string, amountRupees: number) =>
    raiseAlert(supabase, {
      severity: 'warning',
      source: 'payout-sweep',
      title: 'Payout failed',
      message: `Payout ${payoutId} for ₹${amountRupees.toFixed(2)} failed: ${reason}`,
      metadata: { payoutId, reason, amountRupees },
    }),

  payoutReversed: (supabase: SupabaseClient<any>, payoutId: string, ownerId: string, amountRupees: number) =>
    raiseAlert(supabase, {
      severity: 'critical',
      source: 'payout-webhook',
      title: 'Payout reversed after completion',
      message: `Payout ${payoutId} (₹${amountRupees.toFixed(2)} to owner ${ownerId}) was reversed by the beneficiary bank after previously completing. The owner never actually received these funds — a clawback/re-attempt has been recorded.`,
      metadata: { payoutId, ownerId, amountRupees },
    }),

  payoutSweepUnhealthy: (supabase: SupabaseClient<any>, processed: number, failed: number, skipped: number) =>
    raiseAlert(supabase, {
      severity: failed > processed / 2 ? 'critical' : 'warning',
      source: 'payout-sweep',
      title: 'Payout sweep had a high failure rate',
      message: `Sweep processed ${processed}, ${failed} failed, ${skipped} skipped.`,
      metadata: { processed, failed, skipped },
    }),
}
