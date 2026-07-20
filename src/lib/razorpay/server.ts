// lib/razorpay/server.ts
/**
 * Razorpay server utilities.
 *
 * BOOKING PAYMENT FLOW (escrow model)
 * ────────────────────────────────────
 * 1. Student books a seat. We create a plain Razorpay order — NO Route
 *    transfer, NO linked account. The order settles to the PLATFORM's own
 *    Razorpay account, same as any normal merchant payment.
 * 2. Client completes checkout; on success we verify the payment signature,
 *    then mark payments.status='paid' AND payments.escrow_status='held'.
 *    The webhook at /api/payment/razorpay-webhook is the safety net for the
 *    same transition if the client never calls back.
 * 3. Funds sit in escrow (on our own books — Razorpay doesn't have an
 *    "escrow" primitive; we are just not paying anyone out yet) until the
 *    booking is checked-in AND has ended, at which point a DB trigger flips
 *    escrow_status to 'eligible'.
 * 4. A daily cron (/api/cron/run-payouts) sweeps 'eligible' payments and
 *    fires one RazorpayX Payout per booking to the owner's registered bank
 *    account or UPI VPA, net of the platform's 5% commission.
 *
 * PLATFORM SUBSCRIPTION FLOW (₹399/mo per library, UPI AutoPay)
 * ────────────────────────────────────────────────────────────
 * Uses the separate Razorpay Subscriptions API (plans/customers/
 * subscriptions), NOT Orders — see createPlatformSubscriptionPlan,
 * createRazorpaySubscription below. Razorpay manages the recurring billing
 * schedule and retry logic; we react to subscription.* webhook events at
 * /api/payment/subscription-webhook.
 *
 * ENV VARS
 * ────────
 * RAZORPAY_KEY_ID              — platform key (also used as NEXT_PUBLIC_RAZORPAY_KEY_ID)
 * RAZORPAY_KEY_SECRET          — platform secret (server only)
 * RAZORPAY_WEBHOOK_SECRET      — booking-payment webhook secret
 * RAZORPAY_SUBSCRIPTION_WEBHOOK_SECRET — subscription webhook secret (can be
 *                                 the same value as above if you configure
 *                                 both event types on a single Razorpay
 *                                 webhook endpoint+secret — kept as a
 *                                 separate env var so they CAN differ)
 * RAZORPAY_PLATFORM_PLAN_ID    — Razorpay plan_id for the ₹399/mo plan,
 *                                 created once (see createPlatformSubscriptionPlan,
 *                                 or create it manually in the Razorpay
 *                                 dashboard under Subscriptions → Plans and
 *                                 paste the id here)
 */

import crypto from 'crypto'

const KEY_ID     = process.env.RAZORPAY_KEY_ID     ?? ''
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? ''
const API_BASE   = 'https://api.razorpay.com/v1'

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')
}

/* ─── Types ──────────────────────────────────────────────────────────── */

export type CreateOrderParams = {
  amountINR:  number
  currency?:  string
  notes?:     Record<string, string>
}

// Discriminated union — callers must narrow with .success before reading
export type CreateOrderResult =
  | { success: true;  data: { orderId: string; keyId: string } }
  | { success: false; error: string }

/* ─── Create order ───────────────────────────────────────────────────── */
// No Route transfer — every booking order settles to the PLATFORM's own
// Razorpay account. Funds move to the owner later via a separate RazorpayX
// Payout once escrow is eligible (see createPayout below).

export async function createRazorpayOrder(
  params: CreateOrderParams,
): Promise<CreateOrderResult> {
  if (!KEY_ID || !KEY_SECRET) {
    return {
      success: false,
      error: 'Payment gateway is not configured. Please contact support.',
    }
  }

  const { amountINR, currency = 'INR', notes = {} } = params

  const body: Record<string, unknown> = {
    amount:          Math.round(amountINR * 100),  // paise
    currency,
    notes,
    payment_capture: 1,
  }

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': basicAuth(),
      },
      body: JSON.stringify(body),
      // Next.js: no caching for payment calls
      cache: 'no-store',
    })

    if (!res.ok) {
      const err  = (await res.json().catch(() => ({}))) as any
      const desc = err?.error?.description ?? `Razorpay returned HTTP ${res.status}`
      return { success: false, error: desc }
    }

    const order = (await res.json()) as { id: string }
    return { success: true, data: { orderId: order.id, keyId: KEY_ID } }
  } catch (e) {
    return {
      success: false,
      error: 'Failed to connect to payment gateway. Please check your internet connection.',
    }
  }
}

/* ─── Fetch order payments (reconciliation) ──────────────────────────── */
// Used by /api/cron/reconcile-payments to check the REAL state of a
// Razorpay order for a payment that's been stuck 'pending' on our side —
// e.g. because the payments insert failed at booking-creation time, or the
// client closed the tab before either the confirm call or the webhook
// landed. Never trust this blindly for money movement without also
// checking `captured === true` on the specific payment entity returned.

export type RazorpayOrderPayment = {
  id: string
  status: string      // 'created' | 'authorized' | 'captured' | 'failed' | 'refunded'
  captured: boolean
  amount: number       // paise
}

export type FetchOrderPaymentsResult =
  | { success: true; data: RazorpayOrderPayment[] }
  | { success: false; error: string }

export async function fetchRazorpayOrderPayments(
  orderId: string,
): Promise<FetchOrderPaymentsResult> {
  if (!KEY_ID || !KEY_SECRET) {
    return { success: false, error: 'Payment gateway is not configured.' }
  }
  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}/payments`, {
      method: 'GET',
      headers: { 'Authorization': basicAuth() },
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `Razorpay returned HTTP ${res.status}` }
    }
    const body = (await res.json()) as { items?: any[] }
    const items = (body.items ?? []).map(p => ({
      id: p.id as string,
      status: p.status as string,
      captured: !!p.captured,
      amount: p.amount as number,
    }))
    return { success: true, data: items }
  } catch {
    return { success: false, error: 'Failed to connect to payment gateway.' }
  }
}

/* ─── Verify payment signature ───────────────────────────────────────── */

export function verifyRazorpaySignature(
  orderId:   string,
  paymentId: string,
  signature: string,
): boolean {
  if (!KEY_SECRET) return false
  try {
    const expected = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')
    // Constant-time compare to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}

/* ─── Verify subscription checkout signature ─────────────────────────── */
// Used right after the in-page Razorpay Checkout (subscription_id flow)
// returns control to the client with razorpay_payment_id / _subscription_id
// / _signature. NOTE the field order is REVERSED vs order payments:
// payment_id comes first, then subscription_id (see Razorpay's
// "Integrate with Subscriptions" docs). This is a fast client-feedback
// check only — the subscription_webhook route remains the source of truth
// for actually flipping platform_subscriptions.status to 'active'.

export function verifyRazorpaySubscriptionSignature(
  subscriptionId: string,
  paymentId:      string,
  signature:      string,
): boolean {
  if (!KEY_SECRET) return false
  try {
    const expected = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}

/* ─── Verify webhook signature ───────────────────────────────────────── */

export function verifyWebhookSignature(
  rawBody:  string,
  header:   string,
  secret:   string,
): boolean {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(header,   'hex'),
    )
  } catch {
    return false
  }
}
/* ════════════════════════════════════════════════════════════════════════
   PLATFORM SUBSCRIPTIONS (₹399/mo per library, UPI AutoPay mandate)
   Uses Razorpay's Subscriptions API — plans, customers, subscriptions —
   which is entirely separate from the Orders API used for bookings above.
════════════════════════════════════════════════════════════════════════ */

export type RazorpayPlan = { id: string }
export type RazorpayCustomer = { id: string }
export type RazorpaySubscription = {
  id: string
  status: string
  short_url?: string  // hosted checkout page link for the customer to authorize the mandate
}

/**
 * Creates the platform's shared ₹399/mo plan if RAZORPAY_PLATFORM_PLAN_ID is
 * not already set. Idempotent in spirit — intended to be run ONCE (e.g. via
 * a one-off admin setup script or manually in the Razorpay dashboard), with
 * the resulting plan_id then pasted into the RAZORPAY_PLATFORM_PLAN_ID env
 * var. Exposed here mainly for completeness / initial setup convenience —
 * day-to-day subscription creation uses the existing plan_id, not this.
 */
export async function createPlatformSubscriptionPlan(): Promise<
  { success: true; data: RazorpayPlan } | { success: false; error: string }
> {
  if (!KEY_ID || !KEY_SECRET) return { success: false, error: 'Payment gateway is not configured.' }

  try {
    const res = await fetch(`${API_BASE}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth() },
      body: JSON.stringify({
        period: 'monthly',
        interval: 1,
        item: {
          name: 'StudySpace Platform Subscription',
          amount: 39900, // ₹399.00 in paise
          currency: 'INR',
          description: 'Monthly platform subscription per library listing',
        },
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `Razorpay returned HTTP ${res.status}` }
    }
    const plan = (await res.json()) as RazorpayPlan
    return { success: true, data: plan }
  } catch {
    return { success: false, error: 'Failed to connect to payment gateway.' }
  }
}

/** Creates (or should be called once per owner — caller is responsible for
 * reusing an existing customer id if one was already created) a Razorpay
 * Customer record for an owner, required before creating a subscription. */
export async function createRazorpayCustomer(params: {
  name: string
  email?: string | null
  contact?: string | null
}): Promise<{ success: true; data: RazorpayCustomer } | { success: false; error: string }> {
  if (!KEY_ID || !KEY_SECRET) return { success: false, error: 'Payment gateway is not configured.' }

  try {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth() },
      body: JSON.stringify({
        name: params.name,
        email: params.email ?? undefined,
        contact: params.contact ?? undefined,
        fail_existing: '0', // reuse existing customer with same contact/email if one exists
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `Razorpay returned HTTP ${res.status}` }
    }
    const customer = (await res.json()) as RazorpayCustomer
    return { success: true, data: customer }
  } catch {
    return { success: false, error: 'Failed to connect to payment gateway.' }
  }
}

/**
 * Creates a Razorpay subscription for a library's ₹399/mo platform billing.
 * `customer_notify: 1` tells Razorpay to email/SMS the customer the
 * authorization link itself; we ALSO return `short_url` so the app can
 * present an in-app "Authorize AutoPay" button/redirect immediately rather
 * than relying solely on the email — this is the link the owner visits to
 * register their UPI AutoPay (or card) mandate.
 */
export async function createRazorpaySubscription(params: {
  planId: string
  customerId: string
  totalCount?: number // number of billing cycles; large number = effectively indefinite
  notes?: Record<string, string>
}): Promise<{ success: true; data: RazorpaySubscription } | { success: false; error: string }> {
  if (!KEY_ID || !KEY_SECRET) return { success: false, error: 'Payment gateway is not configured.' }

  try {
    const res = await fetch(`${API_BASE}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth() },
      body: JSON.stringify({
        plan_id: params.planId,
        customer_id: params.customerId,
        customer_notify: 1,
        total_count: params.totalCount ?? 1200, // 100 years of monthly cycles ≈ indefinite
        notes: params.notes ?? {},
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `Razorpay returned HTTP ${res.status}` }
    }
    const sub = (await res.json()) as RazorpaySubscription
    return { success: true, data: sub }
  } catch {
    return { success: false, error: 'Failed to connect to payment gateway.' }
  }
}

/** Cancels a Razorpay subscription. `cancelAtCycleEnd=true` lets the owner
 * keep their library live through the period they've already paid for. */
export async function cancelRazorpaySubscription(
  razorpaySubscriptionId: string,
  cancelAtCycleEnd = true,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!KEY_ID || !KEY_SECRET) return { success: false, error: 'Payment gateway is not configured.' }

  try {
    const res = await fetch(`${API_BASE}/subscriptions/${razorpaySubscriptionId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth() },
      body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `Razorpay returned HTTP ${res.status}` }
    }
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to connect to payment gateway.' }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   RAZORPAYX PAYOUTS (owner payout disbursement)
   Requires a separate RazorpayX Business Account + API key pair
   (RAZORPAYX_KEY_ID / RAZORPAYX_KEY_SECRET / RAZORPAYX_ACCOUNT_NUMBER) —
   RazorpayX is a distinct product from standard Razorpay Payments and is
   provisioned separately in the Razorpay dashboard (requires its own KYC
   approval for the business bank account funding the payouts).
════════════════════════════════════════════════════════════════════════ */

const RZPX_KEY_ID     = process.env.RAZORPAYX_KEY_ID     ?? KEY_ID
const RZPX_KEY_SECRET = process.env.RAZORPAYX_KEY_SECRET ?? KEY_SECRET
const RZPX_ACCOUNT_NO = process.env.RAZORPAYX_ACCOUNT_NUMBER ?? ''

function rzpxBasicAuth(): string {
  return 'Basic ' + Buffer.from(`${RZPX_KEY_ID}:${RZPX_KEY_SECRET}`).toString('base64')
}

export type RazorpayContact = { id: string }
export type RazorpayFundAccount = { id: string }
export type RazorpayPayout = { id: string; status: string; utr?: string | null }

/** Creates a RazorpayX Contact for an owner (required once before creating
 * fund accounts). Reuses contact_id if the caller already has one — the
 * server action layer is responsible for not re-creating on every payout. */
export async function createRazorpayContact(params: {
  name: string
  email?: string | null
  contact?: string | null
  type?: string // 'vendor' is the standard type for a payee on a marketplace
}): Promise<{ success: true; data: RazorpayContact } | { success: false; error: string }> {
  if (!RZPX_KEY_ID || !RZPX_KEY_SECRET) return { success: false, error: 'RazorpayX is not configured.' }

  try {
    const res = await fetch('https://api.razorpay.com/v1/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: rzpxBasicAuth() },
      body: JSON.stringify({
        name: params.name,
        email: params.email ?? undefined,
        contact: params.contact ?? undefined,
        type: params.type ?? 'vendor',
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `RazorpayX returned HTTP ${res.status}` }
    }
    const contact = (await res.json()) as RazorpayContact
    return { success: true, data: contact }
  } catch {
    return { success: false, error: 'Failed to connect to RazorpayX.' }
  }
}

/** Creates a RazorpayX Fund Account (bank account OR UPI VPA) linked to a
 * Contact — this is the actual payout destination. */
export async function createRazorpayFundAccount(params: {
  contactId: string
  type: 'bank_account' | 'vpa'
  bankAccount?: { name: string; ifsc: string; accountNumber: string }
  vpa?: { address: string }
}): Promise<{ success: true; data: RazorpayFundAccount } | { success: false; error: string }> {
  if (!RZPX_KEY_ID || !RZPX_KEY_SECRET) return { success: false, error: 'RazorpayX is not configured.' }

  const body: Record<string, unknown> = {
    contact_id: params.contactId,
    account_type: params.type,
  }
  if (params.type === 'bank_account' && params.bankAccount) {
    body.bank_account = {
      name: params.bankAccount.name,
      ifsc: params.bankAccount.ifsc,
      account_number: params.bankAccount.accountNumber,
    }
  } else if (params.type === 'vpa' && params.vpa) {
    body.vpa = { address: params.vpa.address }
  } else {
    return { success: false, error: 'Missing bank account or VPA details for fund account type.' }
  }

  try {
    const res = await fetch('https://api.razorpay.com/v1/fund_accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: rzpxBasicAuth() },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      return { success: false, error: err?.error?.description ?? `RazorpayX returned HTTP ${res.status}` }
    }
    const fundAccount = (await res.json()) as RazorpayFundAccount
    return { success: true, data: fundAccount }
  } catch {
    return { success: false, error: 'Failed to connect to RazorpayX.' }
  }
}

/**
 * Fires a RazorpayX Payout — the actual money movement from the platform's
 * RazorpayX business account to the owner's fund account (bank or VPA).
 * `amountPaise` should already be NET of platform commission (the caller
 * computes the split via lib/booking/escrow.ts before calling this).
 */
export async function createPayout(params: {
  fundAccountId: string
  amountPaise: number
  mode: 'IMPS' | 'NEFT' | 'UPI' | 'RTGS'
  purpose?: string
  referenceId?: string  // internal tracking id for reconciliation, shown on Razorpay dashboard
  notes?: Record<string, string>
  /**
   * REQUIRED — RazorpayX has made this header mandatory for all payout
   * requests since March 2025. Generate once per logical payout attempt
   * and PERSIST it (e.g. on the payouts row) BEFORE calling this function;
   * reuse the SAME key for any retry of that same payout. Using a fresh
   * key on retry of a still-processing payout causes a duplicate real
   * money transfer — this is not optional defensive coding, it is the
   * documented failure mode.
   */
  idempotencyKey: string
}): Promise<{ success: true; data: RazorpayPayout } | { success: false; error: string }> {
  if (!RZPX_KEY_ID || !RZPX_KEY_SECRET || !RZPX_ACCOUNT_NO) {
    return { success: false, error: 'RazorpayX is not configured (missing account number).' }
  }
  if (!params.idempotencyKey || params.idempotencyKey.length < 4) {
    return { success: false, error: 'Internal error: payout idempotency key missing.' }
  }

  try {
    const res = await fetch('https://api.razorpay.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: rzpxBasicAuth(),
        'X-Payout-Idempotency': params.idempotencyKey,
      },
      body: JSON.stringify({
        account_number: RZPX_ACCOUNT_NO,
        fund_account_id: params.fundAccountId,
        amount: params.amountPaise,
        currency: 'INR',
        mode: params.mode,
        purpose: params.purpose ?? 'payout',
        queue_if_low_balance: true,
        reference_id: params.referenceId,
        notes: params.notes ?? {},
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      if (res.status === 409) {
        return { success: false, error: 'A payout with this reference is already being processed. Please check status before retrying.' }
      }
      return { success: false, error: err?.error?.description ?? `RazorpayX returned HTTP ${res.status}` }
    }
    const payout = (await res.json()) as RazorpayPayout
    return { success: true, data: payout }
  } catch {
    return { success: false, error: 'Failed to connect to RazorpayX.' }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   REFUNDS
   Standard Razorpay Refunds API (not RazorpayX) — refunds the STUDENT's
   original payment back to their payment method. Separate from RazorpayX
   Payouts (which sends money TO an owner).
════════════════════════════════════════════════════════════════════════ */

export type RazorpayRefund = { id: string; status: string }

export async function createRazorpayRefund(params: {
  paymentId: string
  amountPaise: number  // for partial refunds — full refund still requires the exact captured amount in paise
  notes?: Record<string, string>
  /**
   * REQUIRED for production correctness. Generate once per logical refund
   * attempt and PERSIST it (e.g. on the refunds row) before calling this
   * function, then reuse the SAME key on any retry of the same refund.
   * Per Razorpay's docs: retrying with a fresh key when the first attempt
   * is still processing causes duplicate refunds — the key must be stable
   * across retries of the same logical operation, not regenerated each call.
   * Must be at least 10 characters (Razorpay's minimum).
   */
  idempotencyKey: string
}): Promise<{ success: true; data: RazorpayRefund } | { success: false; error: string }> {
  if (!KEY_ID || !KEY_SECRET) return { success: false, error: 'Payment gateway is not configured.' }
  if (!params.idempotencyKey || params.idempotencyKey.length < 10) {
    return { success: false, error: 'Internal error: refund idempotency key missing or too short (min 10 chars).' }
  }

  try {
    const res = await fetch(`${API_BASE}/payments/${params.paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(),
        'X-Refund-Idempotency': params.idempotencyKey,
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        notes: params.notes ?? {},
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any
      // 409 = another request with this idempotency key is still in flight.
      // The caller should treat this as "retry later", not "failed forever".
      if (res.status === 409) {
        return { success: false, error: 'A refund request with this reference is already being processed. Please wait and check status before retrying.' }
      }
      return { success: false, error: err?.error?.description ?? `Razorpay returned HTTP ${res.status}` }
    }
    const refund = (await res.json()) as RazorpayRefund
    return { success: true, data: refund }
  } catch {
    return { success: false, error: 'Failed to connect to payment gateway.' }
  }
}