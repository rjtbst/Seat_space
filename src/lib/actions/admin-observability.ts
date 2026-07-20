// lib/actions/admin-observability.ts
'use server'

/**
 * Admin-facing observability: webhook dead-letter queue + alert history.
 * Read-only — this is the visibility layer the production audit flagged
 * as missing ("no admin page to view/retry [failed webhooks] yet").
 */

import { requireActionRole } from '@/lib/auth/guards'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

export type DeadLetterRow = {
  id: string
  provider: string
  externalEventId: string
  eventType: string
  errorMessage: string | null
  retryCount: number
  receivedAt: string
  processedAt: string | null
}

export async function listWebhookDeadLetters(): Promise<ActionResult<DeadLetterRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('webhook_dead_letters')
    .select('*')
    .limit(100)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      provider: r.provider,
      externalEventId: r.external_event_id,
      eventType: r.event_type,
      errorMessage: r.error_message,
      retryCount: r.retry_count,
      receivedAt: r.received_at,
      processedAt: r.processed_at,
    })),
  }
}

export type AlertRow = {
  id: string
  severity: string
  source: string
  title: string
  message: string
  deliveryStatus: string
  createdAt: string
}

export async function listRecentAlerts(): Promise<ActionResult<AlertRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('alert_log')
    .select('id, severity, source, title, message, delivery_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      severity: r.severity,
      source: r.source,
      title: r.title,
      message: r.message,
      deliveryStatus: r.delivery_status,
      createdAt: r.created_at,
    })),
  }
}

/**
 * Returns the raw payload for a dead-lettered webhook event so an admin
 * can inspect what failed. This does NOT automatically re-deliver to the
 * webhook route — Razorpay owns retry delivery within its own retry
 * window; this is for the case where Razorpay has given up and a human
 * needs to decide whether reprocessing is safe.
 */
export async function getDeadLetterPayload(webhookEventId: string): Promise<ActionResult<{ payload: unknown; provider: string; eventType: string }>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('webhook_events')
    .select('payload, provider, event_type')
    .eq('id', webhookEventId)
    .maybeSingle()

  if (error || !data) return { success: false, error: error?.message ?? 'Webhook event not found' }

  return {
    success: true,
    data: { payload: (data as any).payload, provider: (data as any).provider, eventType: (data as any).event_type },
  }
}
