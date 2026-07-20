// src/lib/testMode.ts
/**
 * TEST_MODE payment bypass.
 *
 * When TEST_MODE=true (server env), initiateBooking skips Razorpay order
 * creation and returns a synthetic order ID. The client detects this token
 * and calls confirmBookingPayment directly with synthetic Razorpay params.
 * confirmBookingPayment detects TEST_MODE and skips signature verification.
 *
 * Every other piece of the booking flow — hold creation, seat conflict
 * checks, pricing, notification insertion, revalidatePath calls — runs
 * identically to production so the test exercises the real post-payment path.
 *
 * NEVER enable this in production; the env var guard is intentional.
 */

export const IS_TEST_MODE = process.env.TEST_MODE === 'true'

/** Synthetic IDs injected when TEST_MODE is active. */
export const TEST_ORDER_PREFIX   = 'test_order_'
export const TEST_PAYMENT_PREFIX = 'test_pay_'
export const TEST_SIGNATURE      = 'test_signature_bypass'

export function makeTestOrderId(): string {
  return `${TEST_ORDER_PREFIX}${Date.now()}`
}

export function makeTestPaymentId(): string {
  return `${TEST_PAYMENT_PREFIX}${Date.now()}`
}

/**
 * Returns true if the given orderId / paymentId / signature were generated
 * by TEST_MODE. Used in confirmBookingPayment to skip Razorpay verification.
 */
export function isTestPayload(orderId: string, paymentId: string, signature: string): boolean {
  return (
    IS_TEST_MODE &&
    orderId.startsWith(TEST_ORDER_PREFIX) &&
    paymentId.startsWith(TEST_PAYMENT_PREFIX) &&
    signature === TEST_SIGNATURE
  )
}
