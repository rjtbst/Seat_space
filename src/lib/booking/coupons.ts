// src/lib/booking/coupons.ts
/**
 * Pure discount computation — shared between the subscription-purchase
 * preview (student-subscriptions.ts, used to size the Razorpay order) and
 * anywhere else that needs to show "what would this coupon save." The
 * authoritative, race-safe computation happens server-side inside the
 * create_pending_subscription_with_payment RPC (row-locked); this function
 * exists so the preview and the RPC can never drift apart on the actual
 * arithmetic, even though the RPC re-derives it independently rather than
 * trusting a value computed here.
 */

export type CouponDiscountType = 'percent' | 'flat'

export type CouponLike = {
  discount_type: CouponDiscountType
  discount_value: number
}

/**
 * Returns the rupee amount to discount off basePrice. Always leaves at
 * least ₹1 payable — mirrors the same clamp in the SQL RPC, so a 100%-off
 * or oversized flat coupon can never preview a ₹0 order (which Razorpay
 * would reject anyway).
 */
export function computeCouponDiscount(basePrice: number, coupon: CouponLike): number {
  const raw = coupon.discount_type === 'percent'
    ? Math.round((basePrice * coupon.discount_value) / 100)
    : coupon.discount_value
  return Math.max(0, Math.min(raw, basePrice - 1))
}

export function isCouponUsable(coupon: {
  is_active: boolean
  expires_at: string | null
  plan_id: string | null
  max_redemptions: number | null
  times_redeemed: number
}, planId: string): { ok: true } | { ok: false; error: string } {
  if (!coupon.is_active) return { ok: false, error: 'This coupon is no longer active' }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now())
    return { ok: false, error: 'This coupon has expired' }
  if (coupon.plan_id && coupon.plan_id !== planId)
    return { ok: false, error: 'This coupon is not valid for this plan' }
  if (coupon.max_redemptions !== null && coupon.times_redeemed >= coupon.max_redemptions)
    return { ok: false, error: 'This coupon has reached its redemption limit' }
  return { ok: true }
}
