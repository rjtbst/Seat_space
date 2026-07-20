// lib/actions/student-subscriptions.ts
'use server'

/**
 * Student server actions — library membership plan subscriptions (not platform/owner subscriptions).
 *
 * Split out of the former monolithic lib/actions/student.ts (2,279 lines,
 * 26 exported functions across ~10 unrelated concerns) into focused
 * per-concern files. See lib/actions/student-discovery.ts,
 * student-bookings.ts, student-subscriptions.ts, student-books.ts,
 * student-profile.ts for the full set.
 *
 * All timestamps are plain IST wall-clock strings (no Z / offset suffix).
 * See lib/ist.ts for the convention.
 */

import { revalidatePath } from 'next/cache'
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
import { computeEscrowSplit, computeFeeOnTopSplit, SUBSCRIPTION_COMMISSION_BPS } from '@/lib/booking/escrow'
import { computeCouponDiscount, isCouponUsable } from '@/lib/booking/coupons'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBooking } from '@/lib/booking/slotBoundaryValidation'
import { resolveLibraryStatus, type LibraryStatus } from '@/lib/booking/libraryStatus'
import type { SlotConfig }          from '@/lib/booking/types'
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
export type { ActionResult, ActionOk, ActionErr }

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC TYPES
══════════════════════════════════════════════════════════════════════════ */

export type StudentSubscription = {
  id:            string
  plan_id:       string
  plan_name:     string
  plan_price:    number
  duration_days: number
  session_limit: string | null
  time_window_start: string | null
  time_window_end:   string | null
  days_of_week:      number[] | null
  start_date:    string
  end_date:      string
  status:        string
  days_left:     number
  libraries:     { id: string; name: string; city: string }[]
}


/* ══════════════════════════════════════════════════════════════════════════
   INITIATE PLAN SUBSCRIPTION
══════════════════════════════════════════════════════════════════════════ */

const subscribePlanSchema = z.object({
  planId:     z.string().uuid(),
  libraryId:  z.string().uuid(),
  couponCode: z.string().trim().max(40).optional(),
})

export async function initiatePlanSubscription(
  input: z.infer<typeof subscribePlanSchema>,
): Promise<ActionResult<{
  subscriptionId:  string
  amount:          number   // gross — what Razorpay charges (discounted price + platform fee)
  planPrice:       number   // plan's listed price, before any discount
  discountAmount:  number   // 0 if no coupon applied
  platformFee:     number
  razorpayOrderId: string
  razorpayKeyId:   string
  planName:        string
}>> {
  const parsed = subscribePlanSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Please sign in to subscribe' }

  const { planId, libraryId, couponCode } = parsed.data

  // Verify plan ↔ library link
  const { data: planLib } = await supabase
    .from('plan_libraries')
    .select('plan_id')
    .eq('plan_id', planId)
    .eq('library_id', libraryId)
    .maybeSingle()
  if (!planLib) return { success: false, error: 'Plan not available for this library' }

  const { data: plan } = await supabase
    .from('plans')
    .select('id, name, price, duration_days, owner_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { success: false, error: 'Plan not found' }

  // Block duplicate active subscriptions — also re-checked inside the RPC
  // (the authoritative check); this is just a fast pre-flight for a clean
  // error message before we spend a Razorpay API call.
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('plan_id', planId)
    .eq('status', 'active' as never)
    .maybeSingle()
  if (existing) return { success: false, error: 'You already have an active subscription to this plan' }

  const planPrice = Number((plan as any).price ?? 0)
  if (planPrice <= 0) return { success: false, error: 'Invalid plan price' }

  // ── Coupon preview (read-only) ───────────────────────────────────────
  // This is ONLY used to size the Razorpay order correctly. The RPC below
  // re-validates and re-computes the discount from scratch under a row
  // lock — if the two disagree (coupon state changed in this gap), the RPC
  // rejects rather than silently charging a mismatched amount. See
  // create_pending_subscription_with_payment's comment for the full
  // reasoning.
  let discountedPrice = planPrice
  let discountAmount = 0

  if (couponCode) {
    const { data: coupon } = await supabase
      .from('coupons')
      .select('id, plan_id, discount_type, discount_value, max_redemptions, times_redeemed, is_active, expires_at')
      .eq('owner_id', (plan as any).owner_id)
      .eq('code', couponCode.toUpperCase())
      .maybeSingle()

    if (!coupon) return { success: false, error: 'Invalid coupon code' }

    const usable = isCouponUsable(coupon as any, planId)
    if (usable.ok === false) return { success: false, error: usable.error }

    const { count: userRedemptions } = await supabase
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', (coupon as any).id)
      .eq('user_id', user.id)

    if ((userRedemptions ?? 0) >= ((coupon as any).max_redemptions_per_user ?? 1))
      return { success: false, error: 'You have already used this coupon' }

    discountAmount = computeCouponDiscount(planPrice, coupon as any)
    discountedPrice = planPrice - discountAmount
  }

  // Create Razorpay order — settles to the platform's own account, same as
  // booking payments. Fee-on-top: the discounted plan price is exactly
  // what the owner will receive; the platform fee is added on top of it.
  const { platformFee, totalPayable: amountINR } = computeFeeOnTopSplit(discountedPrice, SUBSCRIPTION_COMMISSION_BPS)

  const orderResult = await createRazorpayOrder({
    amountINR,
    currency: 'INR',
    notes: { student_id: user.id, plan_id: planId, plan_name: (plan as any).name ?? '' },
  })

  if (orderResult.success === false)
    return { success: false, error: orderResult.error }

  const { orderId, keyId } = orderResult.data

  // Atomic insert — subscription + payment (+ coupon redemption, if any).
  // Re-validates the coupon from scratch and rejects rather than persists
  // if the price no longer matches what was just charged via Razorpay.
  const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
    'create_pending_subscription_with_payment',
    {
      p_user_id:           user.id,
      p_plan_id:           planId,
      p_library_id:        libraryId,
      p_razorpay_order_id: orderId,
      p_expected_total:    amountINR,
      p_coupon_code:       couponCode ?? null,
      p_commission_bps:    SUBSCRIPTION_COMMISSION_BPS,
    },
  )

  if (rpcErr) return { success: false, error: rpcErr.message ?? 'Failed to initiate subscription' }

  if (!rpcResult?.success) {
    const errorMessages: Record<string, string> = {
      plan_not_available_for_library: 'Plan not available for this library',
      plan_not_found:                 'Plan not found',
      invalid_plan_price:             'Invalid plan price',
      already_subscribed:             'You already have an active subscription to this plan',
      invalid_coupon:                 'Invalid coupon code',
      coupon_inactive:                'This coupon is no longer active',
      coupon_expired:                 'This coupon has expired',
      coupon_not_valid_for_plan:      'This coupon is not valid for this plan',
      coupon_limit_reached:           'This coupon has reached its redemption limit',
      coupon_already_used:            'You have already used this coupon',
      price_changed_please_retry:     'Pricing just changed — please try again',
    }
    return { success: false, error: errorMessages[rpcResult?.error] ?? 'Failed to initiate subscription' }
  }

  return {
    success: true,
    data: {
      subscriptionId:  rpcResult.subscription_id,
      amount:          amountINR,
      planPrice,
      discountAmount,
      platformFee,
      razorpayOrderId: orderId,
      razorpayKeyId:   keyId,
      planName:        (plan as any).name ?? '',
    },
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   CONFIRM SUBSCRIPTION PAYMENT
══════════════════════════════════════════════════════════════════════════ */

export async function confirmSubscriptionPayment(input: {
  subscriptionId:    string
  razorpayOrderId:   string
  razorpayPaymentId: string
  razorpaySignature: string
}): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!verifyRazorpaySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature))
    return { success: false, error: 'Payment verification failed' }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, user_id, status')
    .eq('id', input.subscriptionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sub) return { success: false, error: 'Subscription not found' }

  const status = sub.status as string
  if (status === 'active') return { success: true, data: undefined }   // idempotent
  if (status !== 'pending') return { success: false, error: 'Subscription cannot be confirmed in its current state' }

  // Read the pending payment so owner_payout_amount/platform_commission_amount
  // can be settled correctly at confirm time — without this, revenue
  // reporting (lib/booking/revenue.ts) falls back to the GROSS `amount`
  // (which includes the platform fee) as the owner's revenue, silently
  // overstating it by the fee on every subscription sale.
  const { data: payment } = await (supabase as any)
    .from('payments')
    .select('id, amount, base_amount, commission_rate_bps')
    .eq('subscription_id', input.subscriptionId)
    .eq('status', 'pending')
    .maybeSingle()

  const ownerAmount = payment?.base_amount ?? null
  const commission  = payment && payment.base_amount != null ? payment.amount - payment.base_amount : null

  const [sRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .update({ status: 'active' as never } as never)
      .eq('id', input.subscriptionId),
    (supabase as any)
      .from('payments')
      .update({
        status:                     'paid',
        razorpay_payment_id:        input.razorpayPaymentId,
        escrow_status:              'not_applicable',
        owner_payout_amount:        ownerAmount,
        platform_commission_amount: commission,
      })
      .eq('subscription_id', input.subscriptionId)
      .eq('status', 'pending'),
  ])

  if (sRes.error) return { success: false, error: sRes.error.message }

  revalidatePath('/subscriptions')
  return { success: true, data: undefined }
}


/* ══════════════════════════════════════════════════════════════════════════
   GET MY SUBSCRIPTIONS
══════════════════════════════════════════════════════════════════════════ */

export async function getMySubscriptions(): Promise<StudentSubscription[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id, plan_id, start_date, end_date, status, created_at,
      plans(id, name, price, duration_days, session_limit, scope, time_window_start, time_window_end, days_of_week,
        plan_libraries(library_id, libraries(id, name, city)))
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  const nowMs = Date.now()

  return (data as any[]).map((s): StudentSubscription => {
    const plan     = s.plans as any
    const planLibs = (plan?.plan_libraries ?? []) as any[]
    const endMs    = s.end_date ? new Date((s.end_date as string) + '+05:30').getTime() : null
    const daysLeft = endMs ? Math.max(0, Math.ceil((endMs - nowMs) / 86_400_000)) : 0

    return {
      id:            s.id,
      plan_id:       s.plan_id,
      plan_name:     plan?.name          ?? 'Unknown Plan',
      plan_price:    Number(plan?.price  ?? 0),
      duration_days: plan?.duration_days ?? 30,
      session_limit: plan?.session_limit ?? null,
      time_window_start: plan?.time_window_start ?? null,
      time_window_end:   plan?.time_window_end   ?? null,
      days_of_week:      (plan as any)?.days_of_week ?? null,
      start_date:    s.start_date ?? '',
      end_date:      s.end_date   ?? '',
      status:        s.status     ?? '',
      days_left:     daysLeft,
      libraries:     planLibs.map((pl) => ({
        id:   pl.libraries?.id   ?? pl.library_id,
        name: pl.libraries?.name ?? '',
        city: pl.libraries?.city ?? '',
      })),
    }
  })
}

