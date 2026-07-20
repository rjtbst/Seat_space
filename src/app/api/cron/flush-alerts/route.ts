// app/api/cron/flush-alerts/route.ts
/**
 * Drains the Upstash Redis alert queue and delivers each alert to Slack,
 * updating alert_log.delivery_status accordingly. Triggered by pg_cron via
 * pg_net every minute (cheap -- Upstash's LPOP is a fast single command,
 * and this is a no-op when the queue is empty).
 *
 * Why a separate flush step instead of delivering inline from raiseAlert():
 * see lib/alerts.ts header comment -- decouples critical webhook/cron
 * paths from Slack's latency/availability entirely.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? ''
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''
const SLACK_WEBHOOK_URL = process.env.SLACK_ALERT_WEBHOOK_URL ?? ''
const ALERT_QUEUE_KEY = 'alerts:outbox'
const MAX_PER_RUN = 50

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  const authHeader = req.headers.get('authorization') ?? ''
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return headerSecret === CRON_SECRET || bearerSecret === CRON_SECRET
}

const SEVERITY_EMOJI: Record<string, string> = {
  info: 'i',
  warning: '[WARN]',
  critical: '[CRITICAL]',
}

async function popOneAlert(): Promise<{ alertId: string; severity: string; source: string; title: string; message: string } | null> {
  const res = await fetch(`${UPSTASH_URL}/lpop/${ALERT_QUEUE_KEY}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.result) return null
  try {
    return JSON.parse(data.result)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabaseClient()
  const results = { delivered: 0, failed: 0, skippedNoSlack: 0 }

  // ── Source 1: Upstash queue (fast path for app-layer raiseAlert() calls) ──
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    for (let i = 0; i < MAX_PER_RUN; i++) {
      const item = await popOneAlert()
      if (!item) break

      if (!SLACK_WEBHOOK_URL) {
        results.skippedNoSlack++
        continue
      }

      try {
        await deliverToSlack(item.severity, item.title, item.source, item.message)
        await supabase
          .from('alert_log')
          .update({ delivery_status: 'delivered', delivered_at: new Date().toISOString() } as never)
          .eq('id', item.alertId)
        results.delivered++
      } catch (err: any) {
        await supabase
          .from('alert_log')
          .update({ delivery_status: 'failed', delivery_error: err?.message ?? String(err) } as never)
          .eq('id', item.alertId)
        results.failed++
        console.error('[flush-alerts] Failed to deliver queued alert', item.alertId, err)
      }
    }
  }

  // ── Source 2: alert_log directly, for any 'pending' row not delivered
  //    above. This is the AUTHORITATIVE fallback path — it catches:
  //    (a) alerts written directly to alert_log by SQL functions (e.g.
  //        sweep_dead_letter_webhooks(), which has no way to call the
  //        Upstash REST API from inside Postgres and so never enqueues),
  //    (b) any alert whose enqueue to Upstash failed silently,
  //    (c) Upstash being unconfigured entirely (skippedNoSlack case above).
  //    Without this pass, SQL-originated alerts would sit at
  //    delivery_status='pending' forever — exactly the silent-failure
  //    pattern this whole feature exists to close.
  if (SLACK_WEBHOOK_URL) {
    const { data: pendingRows } = await supabase
      .from('alert_log')
      .select('id, severity, source, title, message')
      .eq('delivery_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_PER_RUN)

    for (const row of pendingRows ?? []) {
      try {
        await deliverToSlack((row as any).severity, (row as any).title, (row as any).source, (row as any).message)
        await supabase
          .from('alert_log')
          .update({ delivery_status: 'delivered', delivered_at: new Date().toISOString() } as never)
          .eq('id', (row as any).id)
        results.delivered++
      } catch (err: any) {
        await supabase
          .from('alert_log')
          .update({ delivery_status: 'failed', delivery_error: err?.message ?? String(err) } as never)
          .eq('id', (row as any).id)
        results.failed++
        console.error('[flush-alerts] Failed to deliver pending alert_log row', (row as any).id, err)
      }
    }
  } else {
    results.skippedNoSlack++
  }

  return NextResponse.json(results)
}

async function deliverToSlack(severity: string, title: string, source: string, message: string): Promise<void> {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${SEVERITY_EMOJI[severity] ?? ''} *${title}*\n_${source}_\n${message}`,
    }),
  })
  if (!res.ok) throw new Error(`Slack returned HTTP ${res.status}`)
}

export async function GET(req: NextRequest) {
  if (isAuthorized(req)) return POST(req)
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const fakeReq = new NextRequest(req.url, { headers: { 'x-cron-secret': CRON_SECRET } })
  return POST(fakeReq)
}
