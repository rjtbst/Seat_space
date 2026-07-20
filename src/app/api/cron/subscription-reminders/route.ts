// app/api/cron/subscription-reminders/route.ts
/**
 * Daily reminder sweep for platform subscriptions — triggered by pg_cron.
 * Razorpay's own engine handles the actual recurring CHARGE; this route is
 * purely for proactive owner-facing notifications around billing events:
 *   - 3 days before next_billing_at: "renewal coming up" reminder
 *   - subscriptions currently past_due: "fix your payment, N days left in
 *     grace period" reminder (re-sent daily until resolved or expired)
 *
 * (An earlier version of this file also had an "onboarding stuck at
 * payment" nudge here — removed in favor of the in-app status banner on
 * the owner's My Libraries page instead, which works the instant the
 * owner is looking at the page with zero cron/infra dependency. Worth
 * revisiting as a real cron-based reminder once there's actual data on
 * how owners get stuck at onboarding, rather than a guessed cadence.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  const authHeader = req.headers.get('authorization') ?? ''
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return headerSecret === CRON_SECRET || bearerSecret === CRON_SECRET
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabaseClient()
  const results = { upcomingReminders: 0, pastDueReminders: 0, errors: [] as string[] }

  // ── Upcoming renewal reminders (billing within next 3 days) ──────────
  const threeDaysOut = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const { data: upcoming } = await supabase
    .from('platform_subscriptions')
    .select('id, library_id, owner_id, next_billing_at, amount_paise, libraries(name)')
    .eq('status', 'active')
    .lte('next_billing_at', threeDaysOut)
    .gte('next_billing_at', new Date().toISOString())

  for (const sub of upcoming ?? []) {
    try {
      const libName = Array.isArray((sub as any).libraries) ? (sub as any).libraries[0]?.name : (sub as any).libraries?.name
      await (supabase as any).rpc('notify_user', {
        p_user_id: (sub as any).owner_id,
        p_event: 'subscription_renewal_upcoming',
        p_title: 'Subscription renewing soon',
        p_body: `₹${((sub as any).amount_paise / 100).toFixed(2)} will be charged for ${libName ?? 'your library'}'s platform subscription on ${new Date((sub as any).next_billing_at).toLocaleDateString('en-IN')}.`,
        p_payload: {},
        p_library_id: (sub as any).library_id,
        p_booking_id: null,
      })
      results.upcomingReminders++
    } catch (e: any) {
      results.errors.push(`Upcoming reminder failed for sub ${(sub as any).id}: ${e?.message ?? e}`)
    }
  }

  // ── Past-due grace-period reminders ───────────────────────────────────
  const { data: pastDue } = await supabase
    .from('platform_subscriptions')
    .select('id, library_id, owner_id, grace_period_ends_at, libraries(name)')
    .eq('status', 'past_due')
    .gt('grace_period_ends_at', new Date().toISOString())

  for (const sub of pastDue ?? []) {
    try {
      const libName = Array.isArray((sub as any).libraries) ? (sub as any).libraries[0]?.name : (sub as any).libraries?.name
      const daysLeft = Math.max(0, Math.ceil((new Date((sub as any).grace_period_ends_at).getTime() - Date.now()) / 86_400_000))
      await (supabase as any).rpc('notify_user', {
        p_user_id: (sub as any).owner_id,
        p_event: 'subscription_past_due_reminder',
        p_title: 'Action needed: subscription payment failed',
        p_body: `Your platform subscription payment for ${libName ?? 'your library'} failed. You have ${daysLeft} day(s) left before your library goes offline. Please check your AutoPay mandate.`,
        p_payload: {},
        p_library_id: (sub as any).library_id,
        p_booking_id: null,
      })
      results.pastDueReminders++
    } catch (e: any) {
      results.errors.push(`Past-due reminder failed for sub ${(sub as any).id}: ${e?.message ?? e}`)
    }
  }

  console.log('[subscription-reminders] Sweep complete:', results)
  return NextResponse.json(results)
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
