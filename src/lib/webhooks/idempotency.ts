// lib/webhooks/idempotency.ts
/**
 * Shared idempotency gate for inbound webhooks, backed by the
 * webhook_events ledger table (see migration
 * 20260627090000_webhook_idempotency_and_audit.sql).
 *
 * Usage pattern in every webhook route:
 *
 *   const ledgerResult = await recordWebhookEvent(supabase, { provider, externalEventId, eventType, payload })
 *   if (ledgerResult.alreadyProcessed) return NextResponse.json({ received: true, duplicate: true })
 *   try {
 *     ...do the work...
 *     await markWebhookProcessed(supabase, ledgerResult.webhookEventId)
 *     return NextResponse.json({ received: true })
 *   } catch (err) {
 *     await markWebhookFailed(supabase, ledgerResult.webhookEventId, err.message)
 *     return NextResponse.json({ error: 'retry' }, { status: 500 })
 *   }
 *
 * Concurrency note: the INSERT in recordWebhookEvent relies on the table's
 * UNIQUE(provider, external_event_id) constraint to be the actual race-safe
 * gate. Two concurrent deliveries of the same event will both attempt this
 * insert; Postgres guarantees exactly one succeeds and the other gets a
 * 23505 unique_violation, which we interpret as "someone else is handling
 * this (or already did)" rather than an error to surface.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type RecordWebhookEventParams = {
  provider: string
  externalEventId: string
  eventType: string
  payload: unknown
}

export type RecordWebhookEventResult =
  | { alreadyProcessed: true; webhookEventId: null }
  | { alreadyProcessed: false; webhookEventId: string }

export async function recordWebhookEvent(
  supabase: SupabaseClient<any>,
  params: RecordWebhookEventParams,
): Promise<RecordWebhookEventResult> {
  const { data, error } = await supabase
    .from('webhook_events')
    .insert({
      provider: params.provider,
      external_event_id: params.externalEventId,
      event_type: params.eventType,
      payload: params.payload as any,
      status: 'processing',
    } as never)
    .select('id')
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return { alreadyProcessed: true, webhookEventId: null }
    }
    throw new Error(`Failed to record webhook event in idempotency ledger: ${error.message}`)
  }

  return { alreadyProcessed: false, webhookEventId: (data as any).id }
}

export async function markWebhookProcessed(
  supabase: SupabaseClient<any>,
  webhookEventId: string | null,
): Promise<void> {
  if (!webhookEventId) return
  await supabase
    .from('webhook_events')
    .update({ status: 'completed', processed_at: new Date().toISOString() } as never)
    .eq('id', webhookEventId)
}

export async function markWebhookFailed(
  supabase: SupabaseClient<any>,
  webhookEventId: string | null,
  errorMessage: string,
): Promise<void> {
  if (!webhookEventId) return
  try {
    await supabase
      .from('webhook_events')
      .update({
        status: 'failed',
        error_message: errorMessage.slice(0, 2000),
      } as never)
      .eq('id', webhookEventId)
  } catch {
    /* best-effort — see module doc comment */
  }
}
