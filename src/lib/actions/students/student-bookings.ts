// lib/actions/student-bookings.ts
'use server'

/**
 * Student server actions — booking lifecycle: create, confirm, cancel, extend.
 *
 * Split out of the former monolithic lib/actions/student.ts (2,279 lines,
 * 26 exported functions across ~10 unrelated concerns) into focused
 * per-concern files. See lib/actions/student-discovery.ts,
 * student-bookings.ts, student-subscriptions.ts, student-books.ts,
 * student-profile.ts for the full set.
 *
 * Booking payments settle to the platform's own Razorpay account and are
 * held in escrow (payments.escrow_status) until the booking is checked in
 * and has ended — see lib/booking/escrow.ts for the fee-on-top split used
 * when computing the eventual owner payout.
 * All timestamps are plain IST wall-clock strings (no Z / offset suffix).
 * See lib/ist.ts for the convention.
 */

import { revalidatePath } from 'next/cache'
import { getSeatById } from '@/repositories/seats.repository'
import {
  createServerSupabaseClient,
  getSupabaseUser,
} from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { z } from 'zod'
import {
  nowIST,
  monthRangeIST,
  validateISTRange,
  inputToDB,
} from '@/lib/ist'
import { fetchActiveSlotConfigs, fetchSlotConfigs, fetchActiveSlotConfigsCached } from '@/lib/booking/slotConfigService'
import { getActiveCitiesCached } from '@/lib/booking/citiesCache'
import { calculateBookingAmount }   from '@/lib/booking/pricing'
import { computeEscrowSplit, computeFeeOnTopSplit, DEFAULT_COMMISSION_BPS } from '@/lib/booking/escrow'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBooking } from '@/lib/booking/slotBoundaryValidation'
import { resolveLibraryStatus, type LibraryStatus } from '@/lib/booking/libraryStatus'
import type { SlotConfig }          from '@/lib/booking/types'
import { getPaidPaymentForRefund } from '@/lib/booking/getPaidPaymentForRefund'
// Static import — avoids TypeScript losing track of exported types
// when called via dynamic `await import()` inside server action functions.
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from '@/lib/razorpay/server'
import {
  IS_TEST_MODE,
  makeTestOrderId,
  makeTestPaymentId,
  TEST_SIGNATURE,
  isTestPayload,
} from '@/lib/testMode'

/* ─── Shared result type ─────────────────────────────────────────────────── */
import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
import { sendWhatsappNotification } from '@/lib/whatsapp/notify'
import { WA_TEMPLATES, bookingConfirmedParams, newBookingAlertParams, bookingCancelledParams } from '@/lib/whatsapp/templates'
export type { ActionResult, ActionOk, ActionErr }

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC TYPES
══════════════════════════════════════════════════════════════════════════ */

export type StudentBooking = {
  id:           string
  library_id:   string
  library_name: string
  library_city: string
  library_area: string
  cover_url:    string | null
  seat_label:   string
  start_time:   string
  end_time:     string
  status:       string
  booking_mode: string
  amount_paid:  number | null
  base_amount:  number | null  // library's price component of amount_paid (null for walk-ins/legacy)
  platform_fee: number | null  // platform's fee component of amount_paid
  refunded_amount: number      // sum of pending/processing/completed refunds against this booking's payment (0 if none)
  created_at:   string
  payment_id:   string | null
}


/* ══════════════════════════════════════════════════════════════════════════
   INITIATE BOOKING
══════════════════════════════════════════════════════════════════════════ */

const initiateBookingSchema = z.object({
  libraryId: z.string().uuid(),
  seatId:    z.string().uuid(),
  startTime: z.string().min(1),
  endTime:   z.string().min(1),
})

export async function initiateBooking(
  input: z.infer<typeof initiateBookingSchema>,
): Promise<ActionResult<{
  bookingId:       string
  amount:          number  // gross — what Razorpay charges (libraryPrice + platformFee)
  libraryPrice:    number  // what the owner will receive
  platformFee:     number  // fee shown as a separate checkout line
  razorpayOrderId: string
  razorpayKeyId:   string
  libraryName:     string
  hourlyRate:      number
  testMode?:       boolean
}>> {
  const parsed = initiateBookingSchema.safeParse(input)
  if (!parsed.success)
    return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Please sign in to book a seat' }

  // ── Rate limiting ──────────────────────────────────────────────────────
  // Without a limit here, a scripted client could repeatedly create holds
  // with no intent to pay, denying seat availability to real students
  // (each hold occupies the seat via the no_overlapping_bookings exclusion
  // constraint until it expires). This is generous enough for legitimate
  // rapid retry after a "seat just taken" conflict.
  const bookingLimit = await checkRateLimit(
    supabase, `booking:initiate:${user.id}`, RATE_LIMITS.BOOKING_INITIATE_PER_USER,
  )
  if (!bookingLimit.allowed) return { success: false, error: bookingLimit.message }

  const { libraryId, seatId } = parsed.data
  const start = inputToDB(parsed.data.startTime)
  const end   = inputToDB(parsed.data.endTime)

  // Validate time range — use explicit .ok === false narrowing for TS
  const rangeCheck = validateISTRange(start, end, 12)
  if (rangeCheck.ok === false) return { success: false, error: rangeCheck.error }

  // ── Verify seat early — cheap, indexed, needed before any conflict check ──
  const seat = await getSeatById(supabase, seatId)

  if (!seat || seat.library_id !== libraryId) return { success: false, error: 'Seat not found' }
  if (!seat.is_active) return { success: false, error: 'This seat is currently inactive' }

  // ── Race condition protection — conflict checks run FIRST, before any
  //    expensive work (Razorpay order creation), so that when two people
  //    tap "Book" on the same seat at the same time, the losing request
  //    is rejected immediately instead of after creating a payment order
  //    it will never use.
  //
  //    NOTE ON THE ADVISORY LOCK THAT USED TO BE HERE: pg_try_advisory_xact_lock
  //    is transaction-scoped, and each Supabase RPC call runs in its own
  //    transaction that commits immediately on return — so the lock was
  //    released before this function ever reached the INSERT below. It was
  //    providing no real protection and was removed rather than left as
  //    misleading dead code. Don't re-add it without first wrapping the
  //    lock + the bookings INSERT in a single SQL function (one transaction).
  //
  //    The actual, real guarantee against double-booking is the
  //    `no_overlapping_bookings` EXCLUDE constraint on bookings — enforced
  //    by Postgres itself, cannot be bypassed by application code, and
  //    rejects overlapping INSERTs with error 23P01 even if every check
  //    below somehow passed for two concurrent requests. The checks below
  //    are a fast pre-flight to give a clean error message and avoid
  //    wasted work; the constraint is the hard backstop.
  const { data: seatConflict } = await supabase
    .from('bookings')
    .select('id')
    .eq('seat_id', seatId)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])
    .lt('start_time', end)
    .gt('end_time', start)
    .limit(1)

  if (seatConflict?.length)
    return { success: false, error: 'This seat is already booked for the selected time slot. Please choose another seat or time.' }

  // User double-booking guard
  const { data: userConflict } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])
    .lt('start_time', end)
    .gt('end_time', start)
    .limit(1)

  if (userConflict?.length)
    return { success: false, error: 'You already have a booking during this time slot' }

  // Fetch library — is_active gate only; payments now always settle to the
  // platform's own Razorpay account (no per-library Route/linked account).
  const { data: libRaw, error: libErr } = await supabase
    .from('libraries')
    .select('id, name, is_active')
    .eq('id', libraryId)
    .eq('is_active', true)
    .maybeSingle()

  if (libErr || !libRaw)
    return { success: false, error: 'Library not found or inactive' }

  const lib = {
    id:        libRaw.id,
    name:      libRaw.name,
    is_active: libRaw.is_active,
  }

  // SLOT-ONLY ARCHITECTURE: the booking must fit entirely inside one active
  // slot. This single check replaces the old operating-hours check AND
  // implicitly determines pricing (the containing slot IS the price source —
  // see lib/booking/pricing.ts). No base_price fallback.
  const slots = await fetchActiveSlotConfigs(supabase, libraryId)
  const windowCheck = validateBooking({ slots, startTime: start, endTime: end, graceMinutes: 5 })
  if (windowCheck.ok === false) return { success: false, error: windowCheck.error }

  // Calculate amount — single source of truth shared with preview UI,
  // owner/staff manual bookings, and confirmation (lib/booking/pricing.ts).
  // The slot was already confirmed to contain `start` by validateBooking
  // above, so calculateBookingAmount cannot throw NoMatchingSlotError here.
  const priceResolution = calculateBookingAmount(slots, start, end)
  const libraryPrice = priceResolution.amount
  if (libraryPrice <= 0)
    return { success: false, error: 'Invalid booking amount. Please contact the library.' }

  // Fee-on-top: the library's listed price (libraryPrice) is exactly what
  // the owner will receive. The platform fee is added ON TOP of it — the
  // student is charged amountINR = libraryPrice + platformFee via
  // Razorpay. See lib/booking/escrow.ts for the full model.
  const { platformFee, totalPayable: amountINR } = computeFeeOnTopSplit(libraryPrice, DEFAULT_COMMISSION_BPS)

  // Create Razorpay order — only reached after every cheap conflict check
  // above has passed, so a losing request in a race never gets here.
  // TEST_MODE: bypass Razorpay entirely with a synthetic order ID.
  let orderId: string
  let keyId: string

  if (IS_TEST_MODE) {
    console.log('[TEST_MODE] Bypassing Razorpay order creation')
    orderId = makeTestOrderId()
    keyId   = process.env.RAZORPAY_KEY_ID ?? 'test_key'
  } else {
    const orderResult = await createRazorpayOrder({
      amountINR,
      currency: 'INR',
      notes: { student_id: user.id, library_id: libraryId, library_name: lib.name ?? '' },
    })
    if (orderResult.success === false)
      return { success: false, error: orderResult.error }
    orderId = orderResult.data.orderId
    keyId   = orderResult.data.keyId
  }

  // Hold booking (15-min window)
  // nowIST() returns "YYYY-MM-DDTHH:mm:ss.mmm" as plain IST wall-clock.
  // We add 15 min to UTC epoch then format as IST — no double offset.
  const holdExpiry = new Date(Date.now() + 10 * 60_000)
    .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
    .replace(' ', 'T')
    .slice(0, 19)

  // Booking INSERT + pending-payment INSERT happen atomically in one DB
  // transaction via create_held_booking_with_payment — previously these
  // were two separate calls with the payment insert's result never
  // checked, which could leave a held booking with a live Razorpay order
  // and no matching payment row if the second insert failed for any
  // reason. If either insert fails now, both roll back together.
  const { data: createRes, error: createErr } = await (supabase as any).rpc(
    'create_held_booking_with_payment',
    {
      p_user_id:           user.id,
      p_library_id:        libraryId,
      p_seat_id:           seatId,
      p_start_time:        start,
      p_end_time:          end,
      p_hold_expires_at:   holdExpiry,
      p_amount:            amountINR,
      p_razorpay_order_id: orderId,
      p_base_amount:       libraryPrice,
    },
  )

  if (createErr) {
    // PostgreSQL error 23P01 = exclusion_violation (from the
    // no_overlapping_bookings EXCLUDE constraint, re-raised from inside the
    // RPC) — the hard backstop that makes double-booking impossible even if
    // two requests somehow both pass the conflict checks above.
    if ((createErr as any)?.code === '23P01') {
      return { success: false, error: 'This seat was just booked by someone else. Please choose another seat.' }
    }
    if (createErr.message?.includes('DUPLICATE_PAYMENT_ORDER')) {
      return { success: false, error: 'A payment for this booking is already in progress. Please wait a moment and check your bookings before retrying.' }
    }
    return { success: false, error: createErr.message ?? 'Failed to hold seat. Please try again.' }
  }

  if (!createRes?.success) {
    if (createRes?.error === 'seat_conflict')
      return { success: false, error: 'This seat was just booked by someone else. Please choose another seat.' }
    return { success: false, error: 'Failed to hold seat. Please try again.' }
  }

  return {
    success: true,
    data: {
      bookingId:       createRes.booking_id as string,
      amount:          amountINR,      // gross — kept for backward compat with existing callers (this is what Razorpay charges)
      libraryPrice,                    // what the owner will receive
      platformFee,                     // fee shown as a separate checkout line
      razorpayOrderId: orderId,
      razorpayKeyId:   keyId,
      libraryName:     lib.name ?? '',
      hourlyRate:      priceResolution.hourlyRate,
      testMode:        IS_TEST_MODE,
    },
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   CONFIRM BOOKING PAYMENT
══════════════════════════════════════════════════════════════════════════ */

const confirmBookingSchema = z.object({
  bookingId:         z.string().uuid(),
  razorpayOrderId:   z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

export async function confirmBookingPayment(
  input: z.infer<typeof confirmBookingSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = confirmBookingSchema.safeParse(input)
  if (!parsed.success)
    return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data

  // Verify Razorpay signature server-side.
  // TEST_MODE: skip verification for synthetic payment IDs.
  const bypassVerification = isTestPayload(razorpayOrderId, razorpayPaymentId, razorpaySignature)
  if (!bypassVerification && !verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature))
    return { success: false, error: 'Payment verification failed. Contact support if amount was deducted.' }
  if (bypassVerification) {
    console.log('[TEST_MODE] Skipping Razorpay signature verification for booking:', bookingId)
  }

  // Fetch booking (existence/ownership check only — the RPC below re-checks
  // status/hold-expiry itself under a row lock, so there's no TOCTOU gap
  // between this read and the atomic confirm call).
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, status')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!booking)
    return { success: false, error: 'Booking not found' }

  // Idempotent — already confirmed (e.g. webhook beat us to it). The RPC
  // below is also idempotent on its own, but this short-circuits the
  // common case without a round trip.
  if (booking.status === 'confirmed')
    return { success: true, data: { bookingId } }

  // The booking (held->confirmed) and payment (pending->paid, plus the
  // escrow/commission split) updates now happen together in ONE atomic,
  // service-role-only RPC — confirm_booking_payment_captured — shared with
  // the payment.captured webhook. This is what makes it impossible for the
  // two paths to diverge (e.g. booking confirmed but payment stuck
  // 'pending' forever), and it re-validates the hold-expiry grace window
  // itself under a row lock rather than trusting a value read earlier.
  const serviceSupabase = createServiceSupabaseClient()

  const { data: result, error: rpcErr } = await (serviceSupabase as any).rpc(
    'confirm_booking_payment_captured',
    {
      p_booking_id:          bookingId,
      p_expected_user_id:    user.id,
      p_razorpay_order_id:   razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_commission_bps:      DEFAULT_COMMISSION_BPS,
      p_actor_type:          'student',
      p_actor_id:            user.id,
    },
  )

  if (rpcErr) {
    console.error('[confirmBookingPayment] RPC error:', rpcErr)
    return { success: false, error: 'Could not confirm your booking. Contact support if amount was deducted.' }
  }

  if (!result?.success) {
    if (result?.already_confirmed) return { success: true, data: { bookingId } }
    if (result?.error === 'hold_expired_refund_flagged' || String(result?.error).startsWith('booking_status_')) {
      return { success: false, error: 'Your seat hold expired before payment completed. A refund has been raised automatically and will be reviewed by our team — it will be processed within 5–7 business days.' }
    }
    if (result?.error === 'payment_row_missing') {
      console.error('[confirmBookingPayment] CRITICAL: payment row missing for booking', bookingId)
      return { success: false, error: 'We could not locate your payment record. Please contact support with your booking reference — do not retry the payment.' }
    }
    return { success: false, error: 'Payment verification failed. Contact support if amount was deducted.' }
  }

  // Insert in-app booking confirmation notification (non-blocking — failure
  // doesn't affect the confirmed booking)
  try {
    const { data: bkgDetail } = await supabase
      .from('bookings')
      .select('library_id, start_time, end_time, seats(row_label, column_number), libraries(name, owner_id)')
      .eq('id', bookingId)
      .maybeSingle()

    if (bkgDetail) {
      const seat    = (bkgDetail as any).seats
      const library = (bkgDetail as any).libraries
      const seatLabel = seat ? `${seat.row_label}${seat.column_number}` : 'your seat'
      const libName   = library?.name ?? 'the library'
      const ownerId   = library?.owner_id as string | undefined
      const startIST  = bkgDetail.start_time as string
      const startDisplay = startIST.slice(0, 16).replace('T', ' at ')

      await (supabase as any).from('notifications').insert({
        user_id:    user.id,
        library_id: bkgDetail.library_id,
        booking_id: bookingId,
        channel:    'in_app',
        event:      'booking_confirmed',
        status:     'sent',
        title:      'Booking Confirmed ✅',
        body:       `Seat ${seatLabel} at ${libName} confirmed for ${startDisplay}.`,
        payload:    JSON.stringify({ bookingId, seatLabel, libName, startTime: startIST }),
      })

      // WhatsApp — fire-and-forget, never blocks the confirmed booking.
      // Combines booking confirmation + payment receipt into one message.
      const { data: paymentRow } = await supabase
        .from('payments').select('amount').eq('booking_id', bookingId).eq('status', 'paid').maybeSingle()
      const amountRupees = Number((paymentRow as any)?.amount ?? 0)

      const { data: studentRow } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle()
      const studentName = (studentRow as any)?.full_name || 'there'

      void sendWhatsappNotification(supabase, {
        userId: user.id,
        event: 'booking_confirmed',
        title: 'Booking confirmed',
        templateName: WA_TEMPLATES.BOOKING_CONFIRMED,
        templateParams: bookingConfirmedParams({
          studentName, seatLabel, libraryName: libName, startTimeDisplay: startDisplay, amountRupees,
        }),
        libraryId: bkgDetail.library_id,
        bookingId,
      })

      if (ownerId) {
        void sendWhatsappNotification(supabase, {
          userId: ownerId,
          event: 'new_booking_alert',
          title: 'New booking received',
          templateName: WA_TEMPLATES.NEW_BOOKING_ALERT,
          templateParams: newBookingAlertParams({
            libraryName: libName, seatLabel, startTimeDisplay: startDisplay, amountRupees,
          }),
          libraryId: bkgDetail.library_id,
          bookingId,
        })
      }
    }
  } catch (notifErr) {
    // Notification insert failure must never block a confirmed payment
    console.warn('[confirmBookingPayment] notification insert failed:', notifErr)
  }

  revalidatePath('/bookings')
  // Notify staff and owner seat-manager views so they reflect the new
  // confirmed booking without waiting for the next manual page load
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/dashboard')
  return { success: true, data: { bookingId } }
}


/* ══════════════════════════════════════════════════════════════════════════
   CANCEL BOOKING
══════════════════════════════════════════════════════════════════════════ */

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, status, start_time')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!booking) return { success: false, error: 'Booking not found' }

  const status = booking.status as string
  if (!['confirmed', 'held'].includes(status))
    return { success: false, error: 'Only confirmed or held bookings can be cancelled — if you have already checked in, please send a cancellation request instead so admin can review it.' }

  const startMs = new Date((booking.start_time as string) + '+05:30').getTime()
  // Cancellation cutoff: 20 minutes before the booking's start time.
  const CANCEL_CUTOFF_MS = 20 * 60_000
  if (startMs - Date.now() < CANCEL_CUTOFF_MS)
    return { success: false, error: 'Bookings cannot be self-cancelled within 20 minutes of the start time — please send a cancellation request instead so admin can review it.' }

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' as never } as never)
    .eq('id', bookingId)

  if (error) return { success: false, error: error.message }

  // WhatsApp: cancellation confirmation — fire-and-forget, never blocks
  // the cancellation itself (already succeeded above). Refund
  // completion (if paid) gets its own separate notification once
  // Razorpay actually processes it — see refund.processed in
  // app/api/payment/razorpay-webhook/route.ts.
  try {
    const { data: cancelDetail } = await supabase
      .from('bookings').select('library_id, start_time, libraries(name)').eq('id', bookingId).maybeSingle()

    if (cancelDetail) {
      const library = (cancelDetail as any).libraries
      const startIST = cancelDetail.start_time as string
      const { data: studentRow } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle()

      void sendWhatsappNotification(supabase, {
        userId: user.id,
        event: 'booking_cancelled',
        title: 'Booking cancelled',
        templateName: WA_TEMPLATES.BOOKING_CANCELLED,
        templateParams: bookingCancelledParams({
          studentName: (studentRow as any)?.full_name || 'there',
          libraryName: library?.name ?? 'the library',
          startTimeDisplay: startIST.slice(0, 16).replace('T', ' at '),
        }),
        libraryId: cancelDetail.library_id,
        bookingId,
      })
    }
  } catch (notifErr) {
    console.warn('[cancelBooking] WhatsApp notification failed:', notifErr)
  }

  // If this booking had already been paid for (status was 'confirmed', not
  // just an unpaid 'held' slot), the escrowed payment now has no booking
  // left to ever reach checked_in/completed — it would otherwise sit in
  // escrow_status='held' forever with no automatic path forward. Raise a
  // pending refund request for admin review via the SAME atomic,
  // balance-checked RPC the admin refund flow uses (create_refund_if_within_
  // balance), rather than inserting a `refunds` row directly — this closes
  // a gap where the two insertion paths could otherwise double-refund past
  // the payment's original amount.
  //
  // Cancellation policy: the student is refunded owner_payout_amount (the
  // library's listed price) and forfeits the platform fee as a
  // cancellation charge. This uses the split actually persisted on the
  // payment at capture time, not one recomputed against today's rate,
  // exactly like the escrow split itself.
  //
  // NEEDS A PRODUCT DECISION, DO NOT RE-HARDCODE "95%/5%" BELOW: this used
  // to be phrased as a flat "95% refund, 5% retained" policy, which was
  // only ever true back when the commission was a flat 5% deducted FROM
  // the gross amount. Since the fee-on-top migration (see
  // lib/booking/escrow.ts), owner_payout_amount is the library's full
  // listed price and the fee is added ON TOP of it — so the actual
  // percentage refunded now depends on the fee rate at capture time (7%
  // today → refund is ~93.5% of gross, not 95%), and will keep drifting if
  // DEFAULT_COMMISSION_BPS ever changes again. If "flat 95%/5% regardless
  // of fee rate" is the real intended policy, this needs to compute
  // refundAmount = grossAmount * 0.95 explicitly instead of reusing
  // owner_payout_amount. Left as-is (refunding owner_payout_amount, whatever
  // percentage that happens to be) until that's confirmed either way.
  // Best-effort: a failure here must not block the cancellation, which has
  // already succeeded above.
  if (status === 'confirmed') {
    try {
      const serviceSupabase = createServiceSupabaseClient()
      const payment = await getPaidPaymentForRefund(serviceSupabase, bookingId)

      if (payment && (payment as any).escrow_status === 'held') {
        const { data: bkg } = await serviceSupabase
          .from('bookings')
          .select('library_id, libraries(owner_id)')
          .eq('id', bookingId)
          .maybeSingle()

        const ownerId = Array.isArray((bkg as any)?.libraries)
          ? (bkg as any)?.libraries[0]?.owner_id
          : (bkg as any)?.libraries?.owner_id

        const grossAmount = Number((payment as any).amount ?? 0)
        const refundAmount = (payment as any).owner_payout_amount != null
          ? Number((payment as any).owner_payout_amount)
          : computeEscrowSplit(grossAmount, DEFAULT_COMMISSION_BPS).ownerPayoutAmount
        const isFullRefund = refundAmount >= grossAmount - 0.01

        await serviceSupabase
          .from('payments')
          .update({ escrow_status: 'cancelled' } as never)
          .eq('id', (payment as any).id)

        // initiated_by is intentionally NULL here — this is a SYSTEM/student
        // -raised request, not an admin action. create_refund_if_within_
        // balance runs with elevated privileges (SECURITY DEFINER) so it can
        // insert on the student's behalf despite refunds' admin-only RLS
        // policy; admin picks it up from the pending-refunds queue and
        // approves it via approveSystemRefund, which executes the actual
        // Razorpay refund.
        const { error: refundErr } = await serviceSupabase.rpc('create_refund_if_within_balance', {
          p_payment_id: (payment as any).id,
          p_amount: refundAmount,
          p_refund_type: isFullRefund ? 'full' : 'partial',
          p_reason: 'Student cancelled a paid booking — owner\'s listed price refunded, platform fee forfeited as a cancellation charge, auto-flagged for admin review',
          p_admin_notes: '',
          p_initiated_by: null,
          p_booking_id: bookingId,
          p_student_id: user.id,
          p_library_id: (bkg as any)?.library_id ?? null,
          p_owner_id: ownerId ?? null,
          p_payout_already_settled: false,
          p_idempotency_key: `cancel-${bookingId}-${(payment as any).id}`,
        } as never)
        if (refundErr) console.warn('[cancelBooking] refund auto-flag RPC failed:', refundErr.message)
      }
    } catch (refundFlagErr) {
      console.warn('[cancelBooking] failed to auto-flag refund for cancelled paid booking:', refundFlagErr)
    }
  }

  revalidatePath('/bookings')
  // Free up the seat in owner/staff views immediately on next render
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/dashboard')
  return { success: true, data: undefined }
}


/* ══════════════════════════════════════════════════════════════════════════
   REQUEST BOOKING CANCELLATION
══════════════════════════════════════════════════════════════════════════ */

export async function requestBookingCancellation(
  bookingId: string,
  reason: string,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  if (!reason || reason.trim().length < 3)
    return { success: false, error: 'Please tell us why you want to cancel' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, library_id, status, libraries(owner_id)')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!booking) return { success: false, error: 'Booking not found' }

  const status = booking.status as string
  if (!['held', 'confirmed', 'checked_in'].includes(status))
    return { success: false, error: `This booking is '${status}' and can no longer be cancelled` }

  // Nothing to refund for an unpaid held booking that's within the normal
  // self-cancel window — point them at the instant path instead.
  if (status !== 'checked_in') {
    return { success: false, error: 'For a booking you have not checked into yet, please use the instant Cancel option.' }
  }

  const serviceSupabase = createServiceSupabaseClient()
  const payment = await getPaidPaymentForRefund(serviceSupabase, bookingId)

  if (!payment) return { success: false, error: 'No payment found for this booking' }

  const ownerId = Array.isArray((booking as any).libraries)
    ? (booking as any).libraries[0]?.owner_id
    : (booking as any).libraries?.owner_id

  const grossAmount = Number((payment as any).amount ?? 0)
  const suggestedAmount = (payment as any).owner_payout_amount != null
    ? Number((payment as any).owner_payout_amount)
    : computeEscrowSplit(grossAmount, DEFAULT_COMMISSION_BPS).ownerPayoutAmount

  // Insert a lightweight, non-executing 'pending' refund row purely as an
  // admin-visible request — this does NOT call Razorpay and does NOT touch
  // escrow_status or the booking's status. Admin reviews check-in status
  // and either approves (which delegates to the standard, balance-checked
  // initiateRefund flow) or rejects via the existing admin actions.
  const { error } = await serviceSupabase.from('refunds').insert({
    payment_id:  (payment as any).id,
    booking_id:  bookingId,
    student_id:  user.id,
    library_id:  booking.library_id,
    owner_id:    ownerId ?? null,
    refund_type: suggestedAmount >= grossAmount - 0.01 ? 'full' : 'partial',
    status:      'pending',
    amount:      suggestedAmount,
    reason:      `Student cancellation request (checked-in booking): ${reason.trim()}`,
  } as never)

  if (error) return { success: false, error: 'Could not submit your cancellation request. Please try again.' }

  revalidatePath('/bookings')
  return { success: true, data: undefined }
}


/* ══════════════════════════════════════════════════════════════════════════
   GET MY BOOKINGS
══════════════════════════════════════════════════════════════════════════ */

export async function getMyBookings(
  filter: 'upcoming' | 'past' | 'all' = 'all',
): Promise<StudentBooking[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const now = nowIST()

  let query = supabase
    .from('bookings')
    .select(`
      id, library_id, seat_id, start_time, end_time,
      status, booking_mode, created_at,
      seats(row_label, column_number),
      libraries(name, city, area, library_images(image_url, is_cover))
    `)
    .eq('user_id', user.id)

  if (filter === 'upcoming') {
    query = query
      .gte('end_time', now)
      .in('status', ['confirmed', 'checked_in', 'held'] as never[])
      .order('start_time', { ascending: true })
  } else if (filter === 'past') {
    query = query
      .or(`end_time.lt.${now},status.in.(completed,cancelled)`)
      .order('start_time', { ascending: false })
  } else {
    query = query.order('start_time', { ascending: false })
  }

  const { data, error } = await query.limit(60)
  if (error || !data) return []

  // Payments in one query — include refunded/partially_refunded too, not
  // just 'paid', so a cancelled/refunded booking still shows what was
  // actually charged and refunded instead of silently showing no amount
  // info at all.
  const bookingIds = (data as any[]).map((b) => b.id as string)
  const { data: payments } = bookingIds.length
    ? await (supabase as any)
        .from('payments')
        .select('booking_id, amount, base_amount, id, status, refunds(amount, status)')
        .in('status', ['paid', 'partially_refunded', 'refunded'])
        .in('booking_id', bookingIds)
    : { data: [] as any[] }

  const payMap: Record<string, { amount: number; base_amount: number | null; id: string; refunded_amount: number }> = {}
  for (const p of (payments ?? []) as any[]) {
    const refundedAmount = ((p.refunds ?? []) as any[])
      .filter((r) => ['pending', 'processing', 'completed'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
    payMap[p.booking_id] = {
      amount: Number(p.amount),
      base_amount: p.base_amount != null ? Number(p.base_amount) : null,
      id: p.id,
      refunded_amount: refundedAmount,
    }
  }

  return (data as any[]).map((b): StudentBooking => {
    const lib   = b.libraries as any
    const imgs  = (lib?.library_images ?? []) as any[]
    const cover = imgs.find((i) => i.is_cover)?.image_url ?? imgs[0]?.image_url ?? null
    const pay   = payMap[b.id]
    return {
      id:           b.id,
      library_id:   b.library_id,
      library_name: lib?.name ?? 'Unknown',
      library_city: lib?.city ?? '',
      library_area: lib?.area ?? '',
      cover_url:    cover,
      seat_label:   b.seats ? `${b.seats.row_label}${b.seats.column_number}` : '?',
      start_time:   b.start_time ?? '',
      end_time:     b.end_time   ?? '',
      status:       b.status     ?? '',
      booking_mode: b.booking_mode ?? 'online',
      amount_paid:  pay?.amount ?? null,
      base_amount:  pay?.base_amount ?? null,
      platform_fee: pay?.base_amount != null ? Number(pay.amount) - Number(pay.base_amount) : null,
      refunded_amount: pay?.refunded_amount ?? 0,
      created_at:   b.created_at ?? '',
      payment_id:   pay?.id ?? null,
    }
  })
}


/* ══════════════════════════════════════════════════════════════════════════
   EXPIRE STALE HOLDS
══════════════════════════════════════════════════════════════════════════ */

export async function expireStaleHolds(): Promise<{ cancelled: number }> {
  const supabase = await createServerSupabaseClient()
  const now      = nowIST()

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' as never } as never)
    .eq('status', 'held' as never)
    .lt('hold_expires_at', now)
    .select('id')

  if (error) console.error('[expireStaleHolds]', error.message)
  return { cancelled: data?.length ?? 0 }
}

// PASTE THIS INTO src/lib/actions/student.ts
// Add after the cancelBooking function (~line 968)


/* ══════════════════════════════════════════════════════════════════════════
   BOOKING EXTENSION
══════════════════════════════════════════════════════════════════════════ */

export async function initiateBookingExtension(input: {
  bookingId:  string
  newEndTime: string   // "YYYY-MM-DDTHH:mm" — datetime-local value
}): Promise<ActionResult<{
  bookingId:       string
  extensionAmount: number  // gross — what Razorpay charges (libraryPrice + platformFee)
  libraryPrice:    number  // what the owner will receive for the extension
  platformFee:     number
  razorpayOrderId: string
  razorpayKeyId:   string
  libraryName:     string
}>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Please sign in to extend your booking' }

  const newEnd = inputToDB(input.newEndTime)

  // Load booking — must belong to this user and be checked_in or confirmed
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, library_id, seat_id, start_time, end_time, status')
    .eq('id', input.bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!booking) return { success: false, error: 'Booking not found' }
  if (!['confirmed', 'checked_in'].includes(booking.status as string))
    return { success: false, error: 'Only confirmed or checked-in bookings can be extended' }

  const currentEndMs = new Date((booking.end_time as string) + '+05:30').getTime()
  const newEndMs     = new Date(newEnd + '+05:30').getTime()

  if (isNaN(newEndMs))          return { success: false, error: 'Invalid end time' }
  if (newEndMs <= currentEndMs) return { success: false, error: 'New end time must be after current end time' }
  if (newEndMs - new Date((booking.start_time as string) + '+05:30').getTime() > 24 * 3_600_000)
    return { success: false, error: 'Total booking duration cannot exceed 24 hours' }

  // Slot-boundary check: extended window must still fit in the same slot
  const slots = await fetchActiveSlotConfigs(supabase, booking.library_id as string)
  const windowCheck = validateBooking({
    slots,
    startTime: booking.start_time as string,
    endTime:   newEnd,
  })
  if (windowCheck.ok === false) return { success: false, error: windowCheck.error }

  // Seat overlap check for the extension window only
  const { data: overlap } = await supabase
    .from('bookings')
    .select('id')
    .eq('seat_id', booking.seat_id as string)
    .neq('id', booking.id)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])
    .lt('start_time', newEnd)
    .gt('end_time', booking.end_time)

  if (overlap && overlap.length > 0)
    return { success: false, error: 'Seat already booked in this extended time window' }

  // Calculate extension amount (same pricing engine — prorate from current end to new end)
  // Reuses `slots` fetched above for the boundary check — same library,
  // same request, no reason to hit the DB twice for identical data.
  let libraryPrice: number
  try {
    const resolution = calculateBookingAmount(slots, booking.end_time as string, newEnd)
    libraryPrice = resolution.amount
  } catch {
    return { success: false, error: 'No active slot covers the extension period. Please book a new session.' }
  }

  if (libraryPrice <= 0)
    return { success: false, error: 'Extension period is too short to charge' }

  // Fee-on-top: same model as the initial booking — libraryPrice is what
  // the owner receives, extensionAmount (gross) is what's actually charged.
  const { platformFee, totalPayable: extensionAmount } = computeFeeOnTopSplit(libraryPrice, DEFAULT_COMMISSION_BPS)

  // Get library name (payment settles to platform account, same as any booking)
  const { data: lib } = await supabase
    .from('libraries')
    .select('name')
    .eq('id', booking.library_id as string)
    .maybeSingle()

  const orderResult = await createRazorpayOrder({
    amountINR:         extensionAmount,
    currency:          'INR',
    notes: {
      booking_id:   booking.id,
      extension_to: newEnd,
      type:         'booking_extension',
    },
  })

  if (orderResult.success === false) return { success: false, error: orderResult.error }
  const { orderId, keyId } = orderResult.data

  // Store a pending payment tagged with the booking_id + extension end time
  // (we store the extension target in notes; on confirm we update end_time).
  // This insert's result is checked — previously it wasn't, which could
  // leave a live Razorpay order with no matching payment row to confirm
  // against later.
  const { error: paymentInsertErr } = await (supabase as any).from('payments').insert({
    user_id:           user.id,
    booking_id:        booking.id,
    amount:            extensionAmount,
    base_amount:       libraryPrice,
    status:            'pending',
    razorpay_order_id: orderId,
  })

  if (paymentInsertErr) {
    console.error('[initiateBookingExtension] payment insert failed:', paymentInsertErr.message)
    return { success: false, error: 'Failed to start the extension payment. Please try again.' }
  }

  return {
    success: true,
    data: {
      bookingId:       booking.id,
      extensionAmount,
      libraryPrice,
      platformFee,
      razorpayOrderId: orderId,
      razorpayKeyId:   keyId,
      libraryName:     (lib as any)?.name ?? '',
    },
  }
}


export async function confirmBookingExtension(input: {
  bookingId:         string
  newEndTime:        string
  razorpayOrderId:   string
  razorpayPaymentId: string
  razorpaySignature: string
}): Promise<ActionResult<{ bookingId: string; newEndTime: string }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature))
    return { success: false, error: 'Payment verification failed. Contact support if amount was deducted.' }

  const newEnd = inputToDB(input.newEndTime)

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, status')
    .eq('id', input.bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!booking) return { success: false, error: 'Booking not found' }

  // payments has no student-writable UPDATE policy (by design — see escrow
  // migration notes), so this trusted, signature-verified write goes
  // through the service-role client. The booking (end_time) and payment
  // (pending->paid + escrow split) updates now happen together in ONE
  // atomic RPC — confirm_booking_extension_captured — for the same reason
  // as confirmBookingPayment: two independent updates could otherwise
  // diverge silently if one succeeded and the other didn't.
  const serviceSupabase = createServiceSupabaseClient()

  const { data: result, error: rpcErr } = await (serviceSupabase as any).rpc(
    'confirm_booking_extension_captured',
    {
      p_booking_id:          input.bookingId,
      p_expected_user_id:    user.id,
      p_new_end_time:        newEnd,
      p_razorpay_order_id:   input.razorpayOrderId,
      p_razorpay_payment_id: input.razorpayPaymentId,
      p_commission_bps:      DEFAULT_COMMISSION_BPS,
    },
  )

  if (rpcErr) {
    console.error('[confirmBookingExtension] RPC error:', rpcErr)
    return { success: false, error: 'Could not confirm your extension. Contact support if amount was deducted.' }
  }

  if (!result?.success) {
    if (result?.error === 'seat_conflict') {
      return { success: false, error: 'Another booking was just made for this seat in the extended window. Contact support if payment was deducted.' }
    }
    if (result?.error === 'payment_row_missing') {
      console.error('[confirmBookingExtension] CRITICAL: payment row missing for booking', input.bookingId)
      return { success: false, error: 'We could not locate your payment record. Please contact support with your booking reference — do not retry the payment.' }
    }
    return { success: false, error: 'Payment verification failed. Contact support if amount was deducted.' }
  }

  revalidatePath('/bookings')
  return { success: true, data: { bookingId: input.bookingId, newEndTime: newEnd } }
}
