// src/lib/whatsapp/templates.ts
//
// Each of these must exist as an APPROVED template in Meta Business
// Manager (WhatsApp Manager > Message Templates), utility category,
// before it can actually send.
//
// Organized by cost/value so it's an easy decision, not a guess:
//
// CORE (low volume, high value — recommended to enable from day one):
//   - OTP_VERIFICATION        mandatory anyway, one-time per user
//   - BOOKING_CONFIRMED       one per paid booking, builds trust
//   - PAYOUT_PROCESSED        one per payout, financial confirmation
//   - SUBSCRIPTION_PAYMENT_FAILED / TRIAL_OR_SUBSCRIPTION_LAPSED
//                             rare, but prevents a library going dark
//                             without the owner noticing — highest
//                             value-per-message of anything here
//   - SUBSCRIPTION_EXPIRING_SOON
//                             directly drives renewal revenue, fires
//                             once per subscription near its end date
//
// MODERATE (fires roughly once per real action, not per attempt):
//   - NEW_BOOKING_ALERT, BOOKING_CANCELLED, REFUND_PROCESSED
//
// HIGH VOLUME, lower value per message — the two to think hardest
// about before enabling, since these fire on nearly every booking:
//   - HOLD_EXPIRING_SOON      fires for every seat hold, most of which
//                             either convert to a real booking (so the
//                             reminder often isn't even needed) or were
//                             abandoned on purpose
//   - CHECKIN_REMINDER        fires for every single confirmed booking
//
// Both of the high-volume ones are gated behind
// WHATSAPP_TIME_BASED_REMINDERS_ENABLED (see the cron route) so they can
// be turned on/off with an env var, no code change, once you've seen
// real message volume and cost.

export const WA_TEMPLATES = {
  OTP_VERIFICATION: 'otp_verification',

  BOOKING_CONFIRMED: 'booking_confirmed',
  PAYOUT_PROCESSED: 'payout_processed',
  SUBSCRIPTION_PAYMENT_FAILED: 'subscription_payment_failed',
  TRIAL_OR_SUBSCRIPTION_LAPSED: 'trial_or_subscription_lapsed',
  SUBSCRIPTION_EXPIRING_SOON: 'subscription_expiring_soon',
  TRIAL_EXPIRING_SOON: 'trial_expiring_soon',

  NEW_BOOKING_ALERT: 'new_booking_alert',
  BOOKING_CANCELLED: 'booking_cancelled',
  REFUND_PROCESSED: 'refund_processed',

  HOLD_EXPIRING_SOON: 'hold_expiring_soon',
  CHECKIN_REMINDER: 'checkin_reminder',
} as const

/** "Your LibrarySpace verification code is {{1}}. Valid for 10 minutes." */
export function otpVerificationParams(code: string): string[] {
  return [code]
}

/**
 * "Hi {{1}}, your seat {{2}} at {{3}} is confirmed for {{4}}. Amount
 * paid: Rs {{5}}. View your pass in the LibrarySpace app."
 * Doubles as the payment receipt — one message per booking, not two.
 */
export function bookingConfirmedParams(args: {
  studentName: string; seatLabel: string; libraryName: string
  startTimeDisplay: string; amountRupees: number
}): string[] {
  return [args.studentName, args.seatLabel, args.libraryName, args.startTimeDisplay, args.amountRupees.toFixed(0)]
}

/** "New booking at {{1}}: seat {{2}} for {{3}}. Rs {{4}} received." */
export function newBookingAlertParams(args: {
  libraryName: string; seatLabel: string; startTimeDisplay: string; amountRupees: number
}): string[] {
  return [args.libraryName, args.seatLabel, args.startTimeDisplay, args.amountRupees.toFixed(0)]
}

/** "Hi {{1}}, your booking at {{2}} for {{3}} has been cancelled." */
export function bookingCancelledParams(args: {
  studentName: string; libraryName: string; startTimeDisplay: string
}): string[] {
  return [args.studentName, args.libraryName, args.startTimeDisplay]
}

/** "Hi {{1}}, your refund of Rs {{2}} for your booking at {{3}} has been processed." */
export function refundProcessedParams(args: {
  studentName: string; amountRupees: number; libraryName: string
}): string[] {
  return [args.studentName, args.amountRupees.toFixed(0), args.libraryName]
}

/** "Hi {{1}}, a payout of Rs {{2}} has been credited to your account. UTR: {{3}}." */
export function payoutProcessedParams(args: {
  ownerName: string; amountRupees: number; utr: string
}): string[] {
  return [args.ownerName, args.amountRupees.toFixed(0), args.utr || 'pending']
}

/** "Hi {{1}}, the Rs {{2}} payment for your LibrarySpace subscription ({{3}}) failed." */
export function subscriptionPaymentFailedParams(args: {
  ownerName: string; amountRupees: number; libraryName: string
}): string[] {
  return [args.ownerName, args.amountRupees.toFixed(0), args.libraryName]
}

/** "Hi {{1}}, your free trial for {{2}} ends in {{3}} day(s). Set up your Rs399/month subscription now to keep it live." */
export function trialExpiringSoonParams(args: {
  ownerName: string; libraryName: string; daysLeft: string
}): string[] {
  return [args.ownerName, args.libraryName, args.daysLeft]
}

/**
 * Shared by both "free trial ended" and "subscription lapsed" — same
 * message shape, only the reason text differs.
 * "Hi {{1}}, {{2}} has been taken offline because {{3}}. Set up a
 * Rs399/month subscription to bring it back online."
 */
export function trialOrSubscriptionLapsedParams(args: {
  ownerName: string; libraryName: string; reason: string
}): string[] {
  return [args.ownerName, args.libraryName, args.reason]
}

/** "Hi {{1}}, your hold on seat {{2}} at {{3}} expires in {{4}} minutes." */
export function holdExpiringSoonParams(args: {
  studentName: string; seatLabel: string; libraryName: string; minutesLeft: string
}): string[] {
  return [args.studentName, args.seatLabel, args.libraryName, args.minutesLeft]
}

/** "Hi {{1}}, your booking for seat {{2}} at {{3}} starts at {{4}} today." */
export function checkinReminderParams(args: {
  studentName: string; seatLabel: string; libraryName: string; startTimeDisplay: string
}): string[] {
  return [args.studentName, args.seatLabel, args.libraryName, args.startTimeDisplay]
}

/** "Hi {{1}}, your {{2}} membership expires in {{3}} days. Renew to keep booking free." */
export function subscriptionExpiringSoonParams(args: {
  studentName: string; planName: string; daysLeft: string
}): string[] {
  return [args.studentName, args.planName, args.daysLeft]
}
