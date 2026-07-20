// app/api/cron/expire-holds/route.ts

//  * Cron endpoint to expire stale seat holds.
//  *
//  * This is pure housekeeping — nothing correctness-critical depends on
//  * how fast it runs. Every screen that needs to know "is this seat
//  * actually free right now" (student seat grid, explore/library seat
//  * counts, owner/staff dashboards, staff check-in grid) checks
//  * hold_expires_at against the current time directly, not the `status`
//  * column — so an expired hold is already treated as free everywhere
//  * that matters, before this job ever runs. expire_holds_before_insert
//  * also clears a seat's own stale holds inline the instant anyone tries
//  * to book it. All this job does is flip `status` to 'cancelled' in the
//  * database for old held rows so they don't linger forever — a plain
//  * every-5-minutes schedule is fine.
//  *
//  * Vercel crons (vercel.json):
//  *   { "crons": [{ "path": "/api/cron/expire-holds", "schedule": "*/5 * * * *" }] }
//  *
//  * Or external cron:
//  *   GET https://yourdomain.com/api/cron/expire-holds
//  *   Authorization: Bearer YOUR_CRON_SECRET
//  *
//  * ENV: CRON_SECRET
 

import { NextRequest, NextResponse } from 'next/server'
import { expireStaleHolds } from '@/lib/actions/students/student-bookings'

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

  try {
    const result = await expireStaleHolds()
    console.log(`[cron] Expired ${result.cancelled} stale holds`)
    return NextResponse.json({ ok: true, cancelled: result.cancelled, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[cron] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}