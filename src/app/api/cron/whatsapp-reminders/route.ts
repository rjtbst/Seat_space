// app/api/cron/whatsapp-reminders/route.ts
/**
 * Phase 2 WhatsApp notifications — the time-based ones that need a cron
 * sweep rather than firing off an existing webhook/action.
 *
 *   1. Subscription expiring soon — ALWAYS ON. Low volume (a handful per
 *      user per month at most), drives renewal revenue directly.
 *   2. First-library trial expiring soon — ALWAYS ON. Fires exactly
 *      twice per trial (at 2 days left, then 1 day left) — see
 *      TrialBanner.tsx for the matching in-app dashboard banner.
 *   3. Seat hold expiring soon    — gated behind
 *      WHATSAPP_TIME_BASED_REMINDERS_ENABLED. Fires on every abandoned
 *      hold, most of which either convert anyway or were abandoned on
 *      purpose — highest volume, lowest value-per-message here.
 *   3. Check-in reminder          — same gate. Fires on every single
 *      confirmed booking, which adds up fast at real volume.
 *
 * Turn #2/#3 on once you've seen real message volume/cost and decided
 * it's worth it — no code change needed, just set
 * WHATSAPP_TIME_BASED_REMINDERS_ENABLED=true.
 *
 * Dedup, on purpose without a new "reminder_sent" column: each check
 * looks for an existing `notifications` row (channel='whatsapp',
 * matching event + booking_id/subscription_id) before sending. One
 * extra SELECT per candidate row, fine at this volume, and keeps this
 * cron self-contained.
 *
 * Scheduled via pg_cron + pg_net (NOT Vercel Cron — see
 * WHATSAPP_PHASE2_SETUP.md for why and the exact cron.schedule call),
 * matching your existing run-payouts/flush-alerts/subscription-reminders
 * jobs.
 *
 * ENV: CRON_SECRET, WHATSAPP_TIME_BASED_REMINDERS_ENABLED (optional, default off)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { sendWhatsappNotification } from '@/lib/whatsapp/notify'
import { WA_TEMPLATES, holdExpiringSoonParams, checkinReminderParams, subscriptionExpiringSoonParams, trialExpiringSoonParams } from '@/lib/whatsapp/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const HIGH_VOLUME_REMINDERS_ENABLED = process.env.WHATSAPP_TIME_BASED_REMINDERS_ENABLED === 'true'

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false
  const authHeader = req.headers.get('authorization') ?? ''
  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  return authHeader === `Bearer ${CRON_SECRET}` || headerSecret === CRON_SECRET || querySecret === CRON_SECRET
}

async function alreadyNotified(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  event: string,
  column: 'booking_id' | 'subscription_id' | 'library_id',
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('channel', 'whatsapp')
    .eq('event', event)
    .eq(column as any, id)
    .limit(1)
  return !!data && data.length > 0
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceSupabaseClient()
  const results = {
    holdReminders: 0, checkinReminders: 0, subscriptionReminders: 0, trialReminders: 0,
    highVolumeRemindersEnabled: HIGH_VOLUME_REMINDERS_ENABLED,
    errors: [] as string[],
  }
  const now = new Date()

  /* ── 1. Subscription expiring soon (always on) ─────────────────── */
  try {
    const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60_000).toISOString()

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, user_id, plan_id, end_date, plans(name)')
      .eq('status', 'active')
      .lte('end_date', windowEnd)
      .gte('end_date', now.toISOString())

    for (const s of (subs ?? []) as any[]) {
      if (await alreadyNotified(supabase, 'subscription_expiring_soon', 'subscription_id', s.id)) continue

      const daysLeft = Math.max(0, Math.ceil((new Date(s.end_date).getTime() - now.getTime()) / 86_400_000))
      const { data: studentRow } = await supabase.from('users').select('full_name').eq('id', s.user_id).maybeSingle()

      await sendWhatsappNotification(supabase, {
        userId: s.user_id,
        event: 'subscription_expiring_soon',
        title: 'Your membership is expiring soon',
        templateName: WA_TEMPLATES.SUBSCRIPTION_EXPIRING_SOON,
        templateParams: subscriptionExpiringSoonParams({
          studentName: (studentRow as any)?.full_name || 'there',
          planName: s.plans?.name ?? 'Your membership plan',
          daysLeft: String(daysLeft),
        }),
        subscriptionId: s.id,
      })
      results.subscriptionReminders++
    }
  } catch (e: any) {
    results.errors.push(`subscription reminders: ${e?.message ?? e}`)
  }

  /* ── 2. First-library trial expiring soon (always on) ───────────── */
  try {
    const { data: trialLibs } = await supabase
      .from('libraries')
      .select('id, owner_id, name, trial_ends_at')
      .eq('is_active', true)
      .not('trial_ends_at', 'is', null)
      .gt('trial_ends_at', now.toISOString())
      .lt('trial_ends_at', new Date(now.getTime() + 2 * 24 * 60 * 60_000 + 30 * 60_000).toISOString())

    for (const lib of (trialLibs ?? []) as any[]) {
      const daysLeft = Math.ceil((new Date(lib.trial_ends_at).getTime() - now.getTime()) / 86_400_000)
      // Only remind at the 2-day and 1-day marks specifically — not
      // every run in between — dedup'd per exact day count so both
      // fire exactly once each rather than one blanket "expiring soon"
      // event that only ever sends the first time it's true.
      if (daysLeft !== 1 && daysLeft !== 2) continue

      const event = `trial_expiring_${daysLeft}d`
      if (await alreadyNotified(supabase, event, 'library_id', lib.id)) continue

      const { data: ownerRow } = await supabase.from('users').select('full_name').eq('id', lib.owner_id).maybeSingle()

      await sendWhatsappNotification(supabase, {
        userId: lib.owner_id,
        event,
        title: 'Free trial ending soon',
        templateName: WA_TEMPLATES.TRIAL_EXPIRING_SOON,
        templateParams: trialExpiringSoonParams({
          ownerName: (ownerRow as any)?.full_name || 'there',
          libraryName: lib.name,
          daysLeft: String(daysLeft),
        }),
        libraryId: lib.id,
      })
      results.trialReminders++
    }
  } catch (e: any) {
    results.errors.push(`trial reminders: ${e?.message ?? e}`)
  }

  if (!HIGH_VOLUME_REMINDERS_ENABLED) {
    console.log('[whatsapp-reminders] High-volume reminders (hold/check-in) skipped — WHATSAPP_TIME_BASED_REMINDERS_ENABLED is not "true"')
    return NextResponse.json(results)
  }

  /* ── 3. Seat hold expiring soon ───────────────────────────────────── */
  try {
    const windowStart = new Date(now.getTime() + 3 * 60_000).toISOString()
    const windowEnd = new Date(now.getTime() + 7 * 60_000).toISOString()

    const { data: holds } = await supabase
      .from('bookings')
      .select('id, user_id, library_id, hold_expires_at, seats(row_label, column_number), libraries(name)')
      .eq('status', 'held')
      .gte('hold_expires_at', windowStart)
      .lte('hold_expires_at', windowEnd)

    for (const b of (holds ?? []) as any[]) {
      if (await alreadyNotified(supabase, 'hold_expiring_soon', 'booking_id', b.id)) continue

      const seat = b.seats
      const seatLabel = seat ? `${seat.row_label}${seat.column_number}` : 'your seat'
      const minutesLeft = Math.max(1, Math.round((new Date(b.hold_expires_at).getTime() - now.getTime()) / 60_000))
      const { data: studentRow } = await supabase.from('users').select('full_name').eq('id', b.user_id).maybeSingle()

      await sendWhatsappNotification(supabase, {
        userId: b.user_id,
        event: 'hold_expiring_soon',
        title: 'Your seat hold is expiring soon',
        templateName: WA_TEMPLATES.HOLD_EXPIRING_SOON,
        templateParams: holdExpiringSoonParams({
          studentName: (studentRow as any)?.full_name || 'there',
          seatLabel,
          libraryName: b.libraries?.name ?? 'the library',
          minutesLeft: String(minutesLeft),
        }),
        libraryId: b.library_id,
        bookingId: b.id,
      })
      results.holdReminders++
    }
  } catch (e: any) {
    results.errors.push(`hold reminders: ${e?.message ?? e}`)
  }

  /* ── 4. Check-in reminder ────────────────────────────────────────── */
  try {
    const windowStart = new Date(now.getTime() + 15 * 60_000).toISOString()
    const windowEnd = new Date(now.getTime() + 20 * 60_000).toISOString()

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, user_id, library_id, start_time, seats(row_label, column_number), libraries(name)')
      .eq('status', 'confirmed')
      .gte('start_time', windowStart)
      .lte('start_time', windowEnd)

    for (const b of (bookings ?? []) as any[]) {
      if (await alreadyNotified(supabase, 'checkin_reminder', 'booking_id', b.id)) continue

      const seat = b.seats
      const seatLabel = seat ? `${seat.row_label}${seat.column_number}` : 'your seat'
      const startDisplay = String(b.start_time).slice(11, 16)
      const { data: studentRow } = await supabase.from('users').select('full_name').eq('id', b.user_id).maybeSingle()

      await sendWhatsappNotification(supabase, {
        userId: b.user_id,
        event: 'checkin_reminder',
        title: 'Upcoming booking reminder',
        templateName: WA_TEMPLATES.CHECKIN_REMINDER,
        templateParams: checkinReminderParams({
          studentName: (studentRow as any)?.full_name || 'there',
          seatLabel,
          libraryName: b.libraries?.name ?? 'the library',
          startTimeDisplay: startDisplay,
        }),
        libraryId: b.library_id,
        bookingId: b.id,
      })
      results.checkinReminders++
    }
  } catch (e: any) {
    results.errors.push(`checkin reminders: ${e?.message ?? e}`)
  }

  console.log('[whatsapp-reminders] Sweep complete:', results)
  return NextResponse.json(results)
}

export async function GET(req: NextRequest) {
  if (isAuthorized(req)) return POST(req)
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
