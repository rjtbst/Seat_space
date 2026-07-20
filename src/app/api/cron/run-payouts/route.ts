// app/api/cron/run-payouts/route.ts
/**
 * Daily payout sweep -- triggered by pg_cron via pg_net, or manually for
 * testing/Vercel Cron fallback.
 *
 * For every payment with escrow_status = 'eligible':
 *   1. Create (or resume) a `payouts` row, locked via SELECT ... FOR UPDATE
 *      SKIP LOCKED equivalent (see note below) so two concurrent sweep
 *      invocations can never both process the same payout.
 *   2. Resolve the owner's default payout destination (bank or VPA).
 *   3. Fire a RazorpayX Payout for (amount - commission), using a
 *      PERSISTED idempotency key (generated once, reused on every retry of
 *      this same payout row) -- RazorpayX requires this header and treats
 *      a fresh key on retry as a brand new payout, which would double-pay.
 *   4. Update payouts + payments status based on the result; log every
 *      transition to financial_audit_log.
 *
 * CONCURRENCY NOTE: Supabase's REST/PostgREST interface (the client used
 * here) does not expose raw `SELECT ... FOR UPDATE SKIP LOCKED`. The
 * concurrency-safety here instead comes from the unique constraint on
 * payouts.payment_id (one payout row per payment, full stop) combined with
 * claiming a row via a conditional UPDATE (`status='pending' -> 'claimed'`)
 * before doing any external API call -- a second concurrent sweep run will
 * find zero rows affected by its own claim attempt and skip it. This is
 * the same "optimistic claim via conditional UPDATE" pattern used
 * elsewhere in this codebase (e.g. booking confirmation), applied here to
 * a money-movement path where it matters even more.
 *
 * Protected by a shared secret header (x-cron-secret / Bearer) since this
 * route is invoked with no end-user session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { createPayout } from '@/lib/razorpay/server'
import { alerts } from '@/lib/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
// Cap per run -- keeps each invocation's wall-clock time bounded and
// predictable under serverless function timeout limits. At 10,000+
// libraries with daily payout volume well above this, increase the cap
// AND move this to a true background queue (see audit notes) rather than
// raising the limit indefinitely on a single HTTP-request-scoped sweep.
const BATCH_LIMIT = 200

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

  const { data: eligiblePayments, error: fetchErr } = await supabase
    .from('payments')
    .select('id, booking_id, amount, platform_commission_amount, owner_payout_amount, escrow_status')
    .eq('escrow_status', 'eligible')
    .not('booking_id', 'is', null)
    .order('escrow_eligible_at', { ascending: true }) // oldest first -- fairness, avoids starving long-pending payments
    .limit(BATCH_LIMIT)

  if (fetchErr) {
    console.error('[run-payouts] Failed to fetch eligible payments:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const results = { processed: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] as string[] }

  for (const payment of eligiblePayments ?? []) {
    results.processed++
    const paymentId = (payment as any).id as string

    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, library_id, libraries(owner_id, name)')
        .eq('id', (payment as any).booking_id)
        .maybeSingle()

      const libraryId = (booking as any)?.library_id
      const ownerInfo = Array.isArray((booking as any)?.libraries)
        ? (booking as any)?.libraries[0]
        : (booking as any)?.libraries
      const ownerId = ownerInfo?.owner_id

      if (!libraryId || !ownerId) {
        results.skipped++
        results.errors.push(`Payment ${paymentId}: could not resolve library/owner`)
        continue
      }

      const { data: owner } = await supabase
        .from('users')
        .select('payout_default_method, razorpay_fund_account_id_bank, razorpay_fund_account_id_vpa')
        .eq('id', ownerId)
        .maybeSingle()

      const defaultMethod = (owner as any)?.payout_default_method as 'bank_account' | 'vpa' | null
      const fundAccountId = defaultMethod === 'bank_account'
        ? (owner as any)?.razorpay_fund_account_id_bank
        : defaultMethod === 'vpa'
          ? (owner as any)?.razorpay_fund_account_id_vpa
          : null

      const grossAmount = Number((payment as any).amount ?? 0)
      const commissionAmount = Number((payment as any).platform_commission_amount ?? 0)
      let netAmount = Number((payment as any).owner_payout_amount ?? (grossAmount - commissionAmount))

      // ── Apply any pending clawback for this owner before paying out ────
      // If a previous refund was issued against an already-settled payout
      // for this owner, deduct as much as possible from THIS payout rather
      // than sending the full net amount and letting the debt sit forever.
      // Multiple small payouts may be needed to fully recover a large
      // clawback — each one chips away at amount_owed until it reaches 0.
      const { data: pendingClawbacks } = await supabase
        .from('payout_clawbacks')
        .select('id, amount_owed, amount_recovered')
        .eq('owner_id', ownerId)
        .in('status', ['pending', 'recovering'])
        .order('created_at', { ascending: true })

      let clawbackDeduction = 0
      const clawbackUpdates: { id: string; newRecovered: number; remaining: number }[] = []

      for (const cb of pendingClawbacks ?? []) {
        const remaining = Number((cb as any).amount_owed) - Number((cb as any).amount_recovered)
        if (remaining <= 0) continue
        const deductFromThis = Math.min(remaining, netAmount - clawbackDeduction)
        if (deductFromThis <= 0) break
        clawbackDeduction += deductFromThis
        clawbackUpdates.push({
          id: (cb as any).id,
          newRecovered: Number((cb as any).amount_recovered) + deductFromThis,
          remaining: remaining - deductFromThis,
        })
        if (clawbackDeduction >= netAmount) break
      }

      netAmount = Math.round((netAmount - clawbackDeduction) * 100) / 100
      const netAmountPaise = Math.round(netAmount * 100)

      if (netAmountPaise <= 0) {
        // The entire payout was absorbed by a clawback — nothing to send
        // to RazorpayX, but the escrow IS resolved (the booking's payout
        // obligation has been satisfied via the deduction) and the
        // clawback ledger must still be updated.
        for (const u of clawbackUpdates) {
          await supabase
            .from('payout_clawbacks')
            .update({
              amount_recovered: u.newRecovered,
              status: u.remaining <= 0 ? 'recovered' : 'recovering',
            } as never)
            .eq('id', u.id)
        }
        await supabase.from('payments').update({ escrow_status: 'paid_out' } as never).eq('id', paymentId)
        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payment', p_entity_id: paymentId, p_event: 'payout_absorbed_by_clawback',
          p_amount: clawbackDeduction, p_actor_type: 'cron',
        })
        results.succeeded++
        continue
      }

      // Find or create the payout row. The UNIQUE constraint on
      // payouts.payment_id is the hard backstop against ever creating two
      // payout rows for the same payment, even under concurrent sweeps.
      const { data: existingPayout } = await supabase
        .from('payouts')
        .select('id, status, idempotency_key, attempt_count, net_amount_paise')
        .eq('payment_id', paymentId)
        .maybeSingle()

      let payoutId: string
      let idempotencyKey: string
      // The amount actually sent to createPayout below -- for a brand new
      // payout this is the freshly computed netAmountPaise; for a RETRY of
      // an existing failed row it MUST be the amount that was persisted at
      // creation time, never recomputed, because Razorpay rejects a
      // retried idempotency key whose payload differs from the original
      // request (BAD_REQUEST). Any clawback that became pending after the
      // original attempt is picked up on this owner's NEXT payout instead.
      let amountToSendPaise = netAmountPaise

      if (existingPayout) {
        const status = (existingPayout as any).status as string
        // Terminal states -- nothing to do. 'processing' is ALSO treated
        // as a skip here (not retried) because a payout that is already
        // out for processing must not be re-submitted with intent to
        // create a second transfer; if it genuinely got stuck, that is a
        // job for manual reconciliation against the Razorpay dashboard,
        // not an automatic retry of a money-movement call.
        if (['completed', 'processing'].includes(status)) {
          results.skipped++
          continue
        }
        payoutId = (existingPayout as any).id
        idempotencyKey = (existingPayout as any).idempotency_key
          ?? `payout-${payoutId}` // defensive fallback; migration backfills this for all pre-existing rows
        amountToSendPaise = (existingPayout as any).net_amount_paise ?? netAmountPaise
      } else {
        idempotencyKey = randomUUID()
        const { data: newPayout, error: insertErr } = await supabase
          .from('payouts')
          .insert({
            payment_id: paymentId,
            booking_id: (payment as any).booking_id,
            library_id: libraryId,
            owner_id: ownerId,
            status: 'pending',
            gross_amount_paise: Math.round(grossAmount * 100),
            commission_paise: Math.round(commissionAmount * 100),
            net_amount_paise: netAmountPaise,
            clawback_deducted_paise: Math.round(clawbackDeduction * 100),
            destination_type: defaultMethod,
            idempotency_key: idempotencyKey,
          } as never)
          .select('id')
          .single()

        if (insertErr || !newPayout) {
          // 23505 on payment_id unique constraint = another concurrent
          // sweep invocation just created this row first. Not an error --
          // skip and let that invocation own it.
          if ((insertErr as any)?.code === '23505') {
            results.skipped++
            continue
          }
          results.failed++
          results.errors.push(`Payment ${paymentId}: failed to create payout row - ${insertErr?.message}`)
          continue
        }
        payoutId = (newPayout as any).id
      }

      if (!fundAccountId) {
        await supabase
          .from('payouts')
          .update({ status: 'failed', failure_reason: 'Owner has not configured a payout destination (bank account or UPI VPA)' } as never)
          .eq('id', payoutId)
        results.failed++
        results.errors.push(`Payment ${paymentId}: owner ${ownerId} has no payout destination configured`)
        continue
      }

      // ── Claim the row atomically before calling the external API ──────
      // This conditional UPDATE is the actual concurrency gate: it only
      // succeeds (returns a row) if status is STILL 'pending' at the
      // moment of this exact statement. A second concurrent sweep run
      // racing on the same row will find 0 rows updated and skip --
      // neither process can end up calling RazorpayX twice for this payout.
      const { data: claimed, error: claimErr } = await supabase
        .from('payouts')
        .update({ status: 'processing' } as never)
        .eq('id', payoutId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (claimErr) {
        results.failed++
        results.errors.push(`Payment ${paymentId}: failed to claim payout row - ${claimErr.message}`)
        continue
      }
      if (!claimed) {
        // Lost the race to another concurrent invocation, or this row was
        // already moved past 'pending' between our read and this claim.
        results.skipped++
        continue
      }

      const payoutResult = await createPayout({
        fundAccountId,
        amountPaise: amountToSendPaise,
        mode: defaultMethod === 'vpa' ? 'UPI' : 'IMPS',
        purpose: 'payout',
        referenceId: payoutId,
        idempotencyKey,
        notes: { booking_id: (payment as any).booking_id, library_id: libraryId },
      })

      const actualNetAmount = amountToSendPaise / 100
      const isRetryOfExisting = !!existingPayout

      if (payoutResult.success === false) {
        await supabase
          .from('payouts')
          .update({
            status: 'failed',
            failure_reason: payoutResult.error,
            attempt_count: ((existingPayout as any)?.attempt_count ?? 0) + 1,
          } as never)
          .eq('id', payoutId)

        await supabase.rpc('log_financial_event', {
          p_entity_type: 'payout', p_entity_id: payoutId, p_event: 'payout_failed',
          p_amount: actualNetAmount, p_actor_type: 'cron',
          p_metadata: { reason: payoutResult.error },
        })

        results.failed++
        results.errors.push(`Payment ${paymentId}: RazorpayX payout failed - ${payoutResult.error}`)
        continue
      }

      // Payout call succeeded (queued/processing on Razorpay's side).
      // Status stays 'processing' -- a payout webhook (payout.processed /
      // payout.failed / payout.reversed) should flip this to its terminal
      // state; see audit notes for the recommended follow-up webhook.
      await supabase
        .from('payouts')
        .update({
          razorpay_payout_id: payoutResult.data.id,
          razorpay_fund_account_id: fundAccountId,
          attempt_count: ((existingPayout as any)?.attempt_count ?? 0) + 1,
          processed_at: new Date().toISOString(),
        } as never)
        .eq('id', payoutId)

      await supabase
        .from('payments')
        .update({ escrow_status: 'paid_out' } as never)
        .eq('id', paymentId)

      // Apply clawback recovery updates now that the payout has actually
      // been sent — only for a FRESH payout (clawbackUpdates was computed
      // against this exact amount this run). For a retry of an existing
      // row, amountToSendPaise came from the original persisted value, not
      // from this run's clawback computation, so applying clawbackUpdates
      // here would incorrectly record a recovery that wasn't actually
      // reflected in the amount sent.
      if (!isRetryOfExisting) {
        for (const u of clawbackUpdates) {
          await supabase
            .from('payout_clawbacks')
            .update({
              amount_recovered: u.newRecovered,
              status: u.remaining <= 0 ? 'recovered' : 'recovering',
            } as never)
            .eq('id', u.id)
        }
      }

      await supabase.rpc('log_financial_event', {
        p_entity_type: 'payout', p_entity_id: payoutId, p_event: 'payout_initiated',
        p_amount: actualNetAmount, p_actor_type: 'cron',
        p_metadata: {
          razorpay_payout_id: payoutResult.data.id,
          destination_type: defaultMethod,
          ...(!isRetryOfExisting && clawbackDeduction > 0 ? { clawback_deducted: clawbackDeduction } : {}),
        },
      })

      try {
        await (supabase as any).rpc('notify_user', {
          p_user_id: ownerId,
          p_event: 'payout_sent',
          p_title: 'Payout sent',
          p_body: `Rs.${actualNetAmount.toFixed(2)} for a completed booking has been sent to your registered ${defaultMethod === 'vpa' ? 'UPI ID' : 'bank account'}.`,
          p_payload: {},
          p_library_id: libraryId,
          p_booking_id: (payment as any).booking_id,
        })
      } catch { /* notification failure must not fail the payout */ }

      results.succeeded++
    } catch (err: any) {
      results.failed++
      results.errors.push(`Payment ${paymentId}: unexpected error - ${err?.message ?? String(err)}`)
    }
  }

  console.log('[run-payouts] Sweep complete:', results)

  // Raise an alert if the sweep had a meaningfully high failure rate —
  // this is the difference between "one owner has a bad bank account"
  // (expected, routine) and "something is systemically wrong with the
  // payout pipeline" (needs a human now, not whenever someone happens to
  // check the admin payouts page).
  if (results.failed > 0) {
    await alerts.payoutSweepUnhealthy(supabase, results.processed, results.failed, results.skipped)
  }

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
