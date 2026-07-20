// src/lib/booking/escrow.ts
/**
 * Single source of truth for the platform-fee / owner-payout split applied
 * to a booking payment.
 *
 * MODEL (fee-on-top, since 2026-07): the library's listed price is exactly
 * what the owner receives. The platform fee is added ON TOP of that price
 * at checkout — the student pays libraryPrice + fee, not libraryPrice minus
 * a commission. This means:
 *   - owner_payout_amount == the library's listed price, always, exactly
 *     (no rounding drift ever touches the owner's number)
 *   - platform_commission_amount == the fee charged to the student
 *   - payments.amount (gross, what Razorpay actually charged) == the sum
 *     of the two
 *
 * Used by:
 *  - lib/actions/student.ts (initiateBooking / initiateBookingExtension —
 *    computes the fee to show at checkout and to charge via Razorpay)
 *  - the DB functions confirm_booking_payment_captured /
 *    confirm_booking_extension_captured mirror this exact same math in SQL
 *    (see the platform-fee-on-top migration) since the authoritative split
 *    is written there, atomically, at payment-capture time — this TS
 *    version exists so the checkout UI can preview the identical numbers
 *    before payment happens.
 *
 * NOT used for manual/walk-in bookings (owner.manualBookSeat,
 * staff.seniorManualBook) — those are cash/UPI-direct-to-owner payments
 * that never touch the platform's payment gateway, so there is no fee to
 * add and no commission to take. Those payments rows are inserted with
 * platform_commission_amount/owner_payout_amount left NULL; the owner's
 * revenue for those rows is simply `amount` in full (see revenue.ts).
 *
 * The rate is stored in basis points (1 bps = 0.01%) and persisted on the
 * payment row itself (payments.commission_rate_bps) rather than looked up
 * live at payout time, so a later change to the platform rate never
 * retroactively changes the split on an already-captured payment — see the
 * column comment on payments.commission_rate_bps in the schema.
 */

// Default platform fee: 7% (700 bps), added on top of the library's price.
// Matches the DEFAULT on payments.commission_rate_bps in the database
// schema — keep these in sync (see migration_platform_fee_rate_7pct.sql).
export const DEFAULT_COMMISSION_BPS = 700

// Platform fee for SUBSCRIPTION purchases specifically — deliberately a
// separate constant from DEFAULT_COMMISSION_BPS (which stays 7% for
// per-seat bookings). Set to 5% (500 bps) rather than reusing the booking
// rate, because subscriptions are a higher-value, lower-risk transaction
// for the platform (one payment covers many future sessions with no
// per-session refund/escrow overhead) — charging a lower rate here is a
// deliberate business decision, not an oversight. Change this single
// constant to adjust the subscription fee; nothing else needs editing
// (the RPC's default argument matches this value too — see the migration's
// create_pending_subscription_with_payment, keep the two in sync the same
// way DEFAULT_COMMISSION_BPS is already kept in sync with the DB default).
export const SUBSCRIPTION_COMMISSION_BPS = 500

export type FeeOnTopSplit = {
  /** The fee rate (bps) this split was computed with — persisted verbatim. */
  commissionRateBps: number
  /** The library's listed price — this is exactly what the owner receives, unchanged. */
  libraryPrice: number
  /** Platform's fee, charged to the student on top of libraryPrice. */
  platformFee: number
  /** libraryPrice + platformFee — what the student actually pays / what Razorpay charges. */
  totalPayable: number
}

/**
 * Computes the fee-on-top split for a booking: the platform fee is a
 * percentage of the library's listed price, added on top of it.
 *
 * Rounded to the nearest whole rupee (matching how Razorpay amounts are
 * handled elsewhere in this codebase — no fractional paise shown to the
 * student). libraryPrice itself is never touched by rounding — the owner
 * always gets exactly the price they listed.
 */
export function computeFeeOnTopSplit(
  libraryPrice: number,
  commissionRateBps: number = DEFAULT_COMMISSION_BPS,
): FeeOnTopSplit {
  const platformFee = Math.round((libraryPrice * commissionRateBps) / 10_000)
  const totalPayable = libraryPrice + platformFee

  return {
    commissionRateBps,
    libraryPrice,
    platformFee,
    totalPayable,
  }
}

export type EscrowSplit = {
  /** The commission rate (bps) this split was computed with — persisted verbatim. */
  commissionRateBps: number
  /** Platform's cut, in the same currency unit as the input amount (paise/rupees, whatever the caller uses). */
  commissionAmount: number
  /** What remains for the library owner once the platform takes its cut. */
  ownerPayoutAmount: number
}

/**
 * LEGACY / DEFENSIVE-FALLBACK ONLY — commission-deducted split (owner
 * absorbs the fee out of a fixed gross amount). Since the 2026-07
 * fee-on-top migration, new bookings never use this for their primary
 * split — it's kept only as an approximation for the rare defensive
 * fallback branches in student.ts (requestBookingCancellation /
 * cancelBooking) that run if owner_payout_amount is somehow still NULL on
 * an already-paid booking. Do not use this for new checkout flows —
 * use computeFeeOnTopSplit instead.
 */
export function computeEscrowSplit(
  grossAmount: number,
  commissionRateBps: number = DEFAULT_COMMISSION_BPS,
): EscrowSplit {
  const commissionAmount = Math.round((grossAmount * commissionRateBps) / 10_000)
  const ownerPayoutAmount = grossAmount - commissionAmount

  return {
    commissionRateBps,
    commissionAmount,
    ownerPayoutAmount,
  }
}
