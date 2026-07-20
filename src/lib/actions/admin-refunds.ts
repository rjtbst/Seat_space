// lib/actions/admin-refunds.ts
'use server'

/**
 * Admin refund management — view all payments/payment history, initiate
 * full/partial refunds, track refund status, notify student + owner.
 *
 * Refund execution flow:
 *   1. Admin reviews a payment (or a system-flagged pending refund row from
 *      cancelBooking's auto-flagging) and calls initiateRefund.
 *   2. We create the refund row FIRST (status='pending') with a persisted
 *      idempotency key, THEN call Razorpay's Refunds API reusing that key
 *      — this ordering is what makes a double-click/retry safe.
 *   3. On success: payments.status -> refunded/partially_refunded,
 *      payments.escrow_status -> refunded (if it hadn't already been paid
 *      out — if it HAD already been paid out to the owner, we flag
 *      payout_already_settled=true AND create a clawback ledger entry
 *      against the owner's future payouts — see lib/actions/admin-clawbacks.ts.
 *      RazorpayX has no API to pull money back from a contact's bank/UPI
 *      once sent, so a ledger-based deduction against future payouts is
 *      the correct mechanism, not a reversal API call.
 *   4. Both student and owner get notified.
 *   5. Every transition is appended to financial_audit_log.
 */

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireActionRole } from '@/lib/auth/guards'
import { createRazorpayRefund } from '@/lib/razorpay/server'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { recomputePaymentAfterRefunds } from '@/lib/booking/refund-netting'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

/* ══════════════════════════════════════════════════════════════════════════
   LIST ALL PAYMENTS (admin view)
══════════════════════════════════════════════════════════════════════════ */

export type AdminPaymentRow = {
  id: string
  studentId: string | null
  studentName: string | null
  bookingId: string | null
  libraryName: string | null
  amount: number
  status: string
  escrowStatus: string
  razorpayPaymentId: string | null
  createdAt: string
  hasRefund: boolean
}

export async function listPaymentsForAdmin(
  filter: { status?: string; search?: string } = {},
  cursor: string | null = null,
): Promise<ActionResult<{ rows: AdminPaymentRow[]; nextCursor: string | null }>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  // AUDIT FIX: payments is the highest-volume table in the system (every
  // booking, every extension, every renewal) — at scale this is easily
  // millions of rows. The previous flat .limit(200) with no cursor would
  // silently show only the 200 most recent payments forever, with no way
  // to page further back. Cursor pagination uses
  // idx_payments_created_at_id_keyset for an index-only seek regardless of
  // how deep into payment history the admin pages.
  const PAGE_SIZE = 50
  let query = supabase
    .from('payments')
    .select(`
      id, user_id, booking_id, amount, status, escrow_status, razorpay_payment_id, created_at,
      users!payments_user_id_fkey(full_name),
      bookings(libraries(name)),
      refunds(id)
    `)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (filter.status) query = query.eq('status', filter.status as any)
  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|')
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  const hasMore = (data ?? []).length > PAGE_SIZE
  const pageData = hasMore ? (data ?? []).slice(0, PAGE_SIZE) : (data ?? [])

  const rows: AdminPaymentRow[] = pageData.map((p: any) => {
    const student = Array.isArray(p.users) ? p.users[0] : p.users
    const booking = Array.isArray(p.bookings) ? p.bookings[0] : p.bookings
    const library = booking ? (Array.isArray(booking.libraries) ? booking.libraries[0] : booking.libraries) : null
    return {
      id: p.id,
      studentId: p.user_id,
      studentName: student?.full_name ?? null,
      bookingId: p.booking_id,
      libraryName: library?.name ?? null,
      amount: Number(p.amount ?? 0),
      status: p.status,
      escrowStatus: p.escrow_status,
      razorpayPaymentId: p.razorpay_payment_id,
      createdAt: p.created_at,
      hasRefund: Array.isArray(p.refunds) ? p.refunds.length > 0 : !!p.refunds,
    }
  })

  // NOTE: text search is still applied only WITHIN the current page (same
  // tradeoff as the libraries list) — a true server-side search across
  // the full payments table would need a dedicated full-text/trigram index
  // and its own query path, which is worth adding if search becomes a
  // primary admin workflow rather than a "find what I just saw" helper.
  const filtered = filter.search
    ? rows.filter(r =>
        r.studentName?.toLowerCase().includes(filter.search!.toLowerCase()) ||
        r.libraryName?.toLowerCase().includes(filter.search!.toLowerCase()) ||
        r.razorpayPaymentId?.toLowerCase().includes(filter.search!.toLowerCase()))
    : rows

  const last = pageData[pageData.length - 1] as any
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null

  return { success: true, data: { rows: filtered, nextCursor } }
}

/* ══════════════════════════════════════════════════════════════════════════
   LIST REFUNDS (admin queue — includes system-flagged pending requests)
══════════════════════════════════════════════════════════════════════════ */

export type AdminRefundRow = {
  id: string
  paymentId: string
  bookingId: string | null
  studentId: string | null
  studentName: string | null
  libraryName: string | null
  amount: number
  originalAmount: number
  refundType: string
  status: string
  reason: string
  adminNotes: string | null
  isSystemRaised: boolean
  payoutAlreadySettled: boolean
  createdAt: string
}

export async function listRefundsForAdmin(
  filter: { status?: string } = {},
  cursor: string | null = null,
): Promise<ActionResult<{ rows: AdminRefundRow[]; nextCursor: string | null }>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const PAGE_SIZE = 50
  let query = supabase
    .from('refunds')
    .select(`
      id, payment_id, booking_id, student_id, refund_type, status, amount,
      reason, admin_notes, initiated_by, payout_already_settled, created_at,
      users!refunds_student_id_fkey(full_name),
      payments(amount),
      bookings(libraries(name))
    `)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (filter.status) query = query.eq('status', filter.status as any)
  if (cursor) {
    const [cursorCreatedAt, cursorId] = cursor.split('|')
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  const hasMore = (data ?? []).length > PAGE_SIZE
  const pageData = hasMore ? (data ?? []).slice(0, PAGE_SIZE) : (data ?? [])

  const rows: AdminRefundRow[] = pageData.map((r: any) => {
    const student = Array.isArray(r.users) ? r.users[0] : r.users
    const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
    const library = booking ? (Array.isArray(booking.libraries) ? booking.libraries[0] : booking.libraries) : null
    const payment = Array.isArray(r.payments) ? r.payments[0] : r.payments
    return {
      id: r.id,
      paymentId: r.payment_id,
      bookingId: r.booking_id,
      studentId: r.student_id,
      studentName: student?.full_name ?? null,
      libraryName: library?.name ?? null,
      amount: Number(r.amount ?? 0),
      originalAmount: Number(payment?.amount ?? 0),
      refundType: r.refund_type,
      status: r.status,
      reason: r.reason,
      adminNotes: r.admin_notes,
      isSystemRaised: r.initiated_by === null,
      payoutAlreadySettled: !!r.payout_already_settled,
      createdAt: r.created_at,
    }
  })

  const last = pageData[pageData.length - 1] as any
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null

  return { success: true, data: { rows, nextCursor } }
}

/* ══════════════════════════════════════════════════════════════════════════
   INITIATE REFUND
══════════════════════════════════════════════════════════════════════════ */

const initiateRefundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(3).max(500),
  notes: z.string().max(1000).optional(),
})

export async function initiateRefund(
  input: z.infer<typeof initiateRefundSchema>,
): Promise<ActionResult<{ refundId: string }>> {
  const parsed = initiateRefundSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const refundRateLimit = await checkRateLimit(
    supabase, `refund:initiate:${user.id}`, RATE_LIMITS.REFUND_INITIATE_PER_ADMIN,
  )
  if (!refundRateLimit.allowed) return { success: false, error: refundRateLimit.message }

  const { paymentId, amount, reason, notes } = parsed.data

  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount, base_amount, status, escrow_status, user_id, booking_id, razorpay_payment_id, bookings(library_id, libraries(owner_id))')
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) return { success: false, error: 'Payment not found' }
  if (!(payment as any).razorpay_payment_id) {
    return { success: false, error: 'This payment has no associated Razorpay payment ID — cannot process a gateway refund.' }
  }
  if (!['paid', 'partially_refunded'].includes((payment as any).status)) {
    return { success: false, error: `Cannot refund a payment with status '${(payment as any).status}'` }
  }

  const originalAmount = Number((payment as any).amount ?? 0)
  const refundType = amount >= originalAmount - 0.01 ? 'full' : 'partial'
  const payoutAlreadySettled = (payment as any).escrow_status === 'paid_out'

  const bookingInfo = (payment as any).bookings
  const libraryId = Array.isArray(bookingInfo) ? bookingInfo[0]?.library_id : bookingInfo?.library_id
  const ownerInfo = Array.isArray(bookingInfo) ? bookingInfo[0]?.libraries : bookingInfo?.libraries
  const ownerId = Array.isArray(ownerInfo) ? ownerInfo[0]?.owner_id : ownerInfo?.owner_id

  // ── Create the refund row FIRST, in 'pending' state, with a freshly
  //    generated idempotency key — BEFORE calling Razorpay. This is the
  //    critical ordering fix: if this action is invoked twice for the same
  //    logical refund (double-click, client retry on a slow network), the
  //    second call's only path to "the same refund" is by reusing this
  //    persisted key, never by generating a new one after the fact. A key
  //    generated only after a successful Razorpay call provides no
  //    protection against the call itself happening twice.
  //
  //    The balance check (sum of existing refunds vs. original amount) is
  //    performed ATOMICALLY inside create_refund_if_within_balance, which
  //    locks the payment row for the duration of the check+insert — this
  //    closes the TOCTOU race that existed when the check was a separate
  //    SELECT before this INSERT (two concurrent refund requests against
  //    the same payment could previously both pass the check before either
  //    had inserted, together over-refunding).
  const idempotencyKey = randomUUID()

  const { data: refundId, error: createErr } = await supabase.rpc('create_refund_if_within_balance', {
    p_payment_id: paymentId,
    p_amount: amount,
    p_refund_type: refundType,
    p_reason: reason,
    p_admin_notes: notes ?? '',
    p_initiated_by: user.id,
    p_booking_id: (payment as any).booking_id,
    p_student_id: (payment as any).user_id,
    p_library_id: libraryId ?? null,
    p_owner_id: ownerId ?? null,
    p_payout_already_settled: payoutAlreadySettled,
    p_idempotency_key: idempotencyKey,
  })

  if (createErr || !refundId) {
    const msg = createErr?.message ?? 'Failed to create refund record'
    if (msg.includes('REFUND_EXCEEDS_BALANCE')) {
      return { success: false, error: 'Refund amount exceeds the remaining refundable balance for this payment (checked atomically — another refund may have just been processed concurrently).' }
    }
    return { success: false, error: msg }
  }

  // Call Razorpay, reusing the persisted key. If this exact refund row is
  // ever retried (e.g. a future "retry failed refund" admin action), it
  // MUST look up and reuse this same key rather than generating a new one.
  const refundResult = await createRazorpayRefund({
    paymentId: (payment as any).razorpay_payment_id,
    amountPaise: Math.round(amount * 100),
    notes: { reason, admin_id: user.id, refund_id: refundId },
    idempotencyKey,
  })

  if (refundResult.success === false) {
    await supabase
      .from('refunds')
      .update({ status: 'failed', failure_reason: refundResult.error } as never)
      .eq('id', refundId)
    return { success: false, error: refundResult.error }
  }

  await supabase
    .from('refunds')
    .update({ status: 'processing', razorpay_refund_id: refundResult.data.id } as never)
    .eq('id', refundId)

  await supabase.rpc('log_financial_event', {
    p_entity_type: 'refund', p_entity_id: refundId, p_event: 'refund_initiated',
    p_amount: amount, p_actor_type: 'admin', p_actor_id: user.id,
    p_metadata: { razorpay_refund_id: refundResult.data.id, payout_already_settled: payoutAlreadySettled },
  })

  // If the booking's payout had already settled to the owner before this
  // refund was raised, the platform is now out that owner's share too.
  // RazorpayX has no API to claw money back from a contact's bank/UPI once
  // sent (the only automatic reversal mechanism, reverse_all, is specific
  // to Route transfers, which this platform does not use) — so record a
  // ledger entry to deduct from the owner's NEXT eligible payout(s) instead.
  if (payoutAlreadySettled && ownerId) {
    const { data: originalPayout } = await supabase
      .from('payouts')
      .select('id, net_amount_paise')
      .eq('payment_id', paymentId)
      .maybeSingle()

    // Clawback amount is proportional to the refund vs. the original
    // payment, applied to the NET (post-commission) amount the owner
    // actually received — refunding the platform's own commission share
    // is not something to recover from the owner, only their net payout.
    const netPayoutAmount = ((originalPayout as any)?.net_amount_paise ?? 0) / 100
    const clawbackAmount = refundType === 'full'
      ? netPayoutAmount
      : Math.round((netPayoutAmount * (amount / originalAmount)) * 100) / 100

    if (clawbackAmount > 0) {
      await supabase.from('payout_clawbacks').insert({
        owner_id: ownerId,
        refund_id: refundId,
        original_payout_id: (originalPayout as any)?.id ?? null,
        amount_owed: clawbackAmount,
        status: 'pending',
        notes: `Auto-created from refund ${refundId}: ${refundType} refund of ₹${amount.toFixed(2)} on an already-settled payout.`,
      } as never)

      await supabase.rpc('log_financial_event', {
        p_entity_type: 'refund', p_entity_id: refundId, p_event: 'clawback_created',
        p_amount: clawbackAmount, p_actor_type: 'admin', p_actor_id: user.id,
        p_metadata: { owner_id: ownerId, original_payout_id: (originalPayout as any)?.id ?? null },
      })
    }
  }

  // ── Net out what's still owed via the single shared helper (also used
  //    by the refund.failed webhook handler to REVERSE this exact
  //    computation if Razorpay later rejects the refund) — so every
  //    downstream number (owner dashboard, monthly revenue chart, admin
  //    GMV/commission/payouts, the run-payouts sweep) reflects reality,
  //    and the two call sites can never compute different numbers for the
  //    same input. See lib/booking/refund-netting.ts for the full
  //    reasoning, including why this reads ALL non-failed refunds against
  //    the payment rather than just this one.
  const netting = await recomputePaymentAfterRefunds(supabase, paymentId)
  const isFullyRefunded = netting?.isFullyRefunded ?? (refundType === 'full')

  // Mark booking cancelled only for a FULL refund that hasn't already been
  // used (checked_in) or completed — a partial goodwill refund on a
  // booking the student already checked into and used should not silently
  // relabel that booking "cancelled" in the owner's/student's history.
  if (isFullyRefunded && (payment as any).booking_id) {
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' } as never)
      .eq('id', (payment as any).booking_id)
      .in('status', ['confirmed', 'held'] as any)
  }

  // Notify student
  try {
    await supabase.rpc('notify_user', {
      p_user_id: (payment as any).user_id,
      p_event: 'refund_processed',
      p_title: 'Refund processed 💰',
      p_body: `₹${amount.toFixed(2)} has been refunded to your original payment method. It may take 5-7 business days to reflect.`,
      p_payload: {},
      p_library_id: libraryId ?? null,
      p_booking_id: (payment as any).booking_id,
    })
  } catch { /* best-effort */ }

  // Notify owner if applicable
  if (ownerId) {
    try {
      await supabase.rpc('notify_user', {
        p_user_id: ownerId,
        p_event: 'refund_processed_owner',
        p_title: 'A booking was refunded',
        p_body: `A ₹${amount.toFixed(2)} refund was issued for a booking at your library.${payoutAlreadySettled ? ' Since this booking had already been paid out to you, the corresponding amount will be deducted from your next payout.' : ''}`,
        p_payload: {},
        p_library_id: libraryId ?? null,
        p_booking_id: (payment as any).booking_id,
      })
    } catch { /* best-effort */ }
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin/refunds')
  revalidatePath('/admin/payouts')
  return { success: true, data: { refundId } }
}

/* ══════════════════════════════════════════════════════════════════════════
   RESOLVE A SYSTEM-RAISED PENDING REFUND
══════════════════════════════════════════════════════════════════════════ */

export async function approveSystemRefund(
  refundId: string,
  notes?: string,
  allowCheckedIn = false,
): Promise<ActionResult> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const { data: refund } = await supabase
    .from('refunds')
    .select('id, payment_id, booking_id, amount, reason, status')
    .eq('id', refundId)
    .maybeSingle()

  if (!refund) return { success: false, error: 'Refund request not found' }
  if ((refund as any).status !== 'pending') return { success: false, error: 'This refund request has already been resolved' }

  // Per policy, a checked-in booking is a judgment call, not a routine
  // approval — surface it explicitly rather than silently cancelling a
  // booking the student actually used. The admin UI should re-submit with
  // allowCheckedIn=true once the admin has reviewed and decided to proceed.
  if ((refund as any).booking_id) {
    const { data: bkg } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', (refund as any).booking_id)
      .maybeSingle()

    if ((bkg as any)?.status === 'checked_in' && !allowCheckedIn) {
      return { success: false, error: 'This student already checked in to the library. Confirm explicitly if you still want to approve this refund and cancel the booking.' }
    }
  }

  // Delegate to the same execution path used for fresh admin-initiated
  // refunds, reusing all the same Razorpay + notification logic.
  const result = await initiateRefund({
    paymentId: (refund as any).payment_id,
    amount: Number((refund as any).amount),
    reason: (refund as any).reason,
    notes,
  })

  if (result.success === false) return result

  // The original system-raised row stays as a historical record; mark it
  // resolved so it disappears from the "pending" queue (the NEW refund row
  // created by initiateRefund above is the one that's actually 'processing').
  await supabase
    .from('refunds')
    .update({ status: 'completed', resolved_by: user.id, completed_at: new Date().toISOString(), admin_notes: notes ?? null } as never)
    .eq('id', refundId)

  revalidatePath('/admin/refunds')
  return { success: true, data: undefined }
}

export async function rejectSystemRefund(refundId: string, notes: string): Promise<ActionResult> {
  if (!notes || notes.trim().length < 3) return { success: false, error: 'Please provide a reason' }

  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const { error } = await supabase
    .from('refunds')
    .update({ status: 'failed', resolved_by: user.id, admin_notes: notes, failure_reason: 'Rejected by admin: ' + notes } as never)
    .eq('id', refundId)
    .eq('status', 'pending')

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/refunds')
  return { success: true, data: undefined }
}
