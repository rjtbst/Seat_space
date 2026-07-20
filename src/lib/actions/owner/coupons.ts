'use server'

// src/lib/actions/owner/coupons.ts
// Owner-side coupon CRUD — create discount codes for subscription plans,
// shared manually (WhatsApp/email) with students. All the actual discount
// SAFETY (limits, expiry, per-user cap, price floor) is enforced inside
// create_pending_subscription_with_payment (see the migration) — this file
// is just CRUD around the coupons table, gated by RLS (owner_id = auth.uid())
// as the hard backstop, same as every other owner-scoped action in this app.

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log, logError } from '@/lib/logger'
import { z } from 'zod'

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */

export type OwnerCoupon = {
  id:                    string
  code:                  string
  planId:                string | null
  planName:              string | null   // null = valid for any of this owner's plans
  discountType:          'percent' | 'flat'
  discountValue:         number
  maxRedemptions:        number | null
  maxRedemptionsPerUser: number
  timesRedeemed:         number
  isActive:              boolean
  expiresAt:             string | null
  createdAt:             string
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET OWNER COUPONS
═══════════════════════════════════════════════════════════════════════════ */

export async function getOwnerCoupons(): Promise<OwnerCoupon[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, plan_id, discount_type, discount_value, max_redemptions, max_redemptions_per_user, times_redeemed, is_active, expires_at, created_at, plans(name)')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (error || !data) { if (error) logError('getOwnerCoupons', 'Fetch failed', error); return [] }

  return (data as any[]).map(c => ({
    id:                    c.id,
    code:                  c.code,
    planId:                c.plan_id,
    planName:              c.plans?.name ?? null,
    discountType:          c.discount_type,
    discountValue:         Number(c.discount_value),
    maxRedemptions:        c.max_redemptions,
    maxRedemptionsPerUser: c.max_redemptions_per_user,
    timesRedeemed:         c.times_redeemed,
    isActive:              c.is_active,
    expiresAt:             c.expires_at,
    createdAt:             c.created_at,
  }))
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREATE COUPON
═══════════════════════════════════════════════════════════════════════════ */

const createCouponSchema = z.object({
  code:                  z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _ only'),
  planId:                z.string().uuid().optional(),   // omit = valid for any of this owner's plans
  discountType:          z.enum(['percent', 'flat']),
  discountValue:         z.number().positive(),
  maxRedemptions:        z.number().int().positive().optional(),
  maxRedemptionsPerUser: z.number().int().positive().default(1),
  expiresAt:             z.string().optional(),   // ISO date, optional
})

export async function createCoupon(
  input: z.infer<typeof createCouponSchema>,
): Promise<ActionResult<{ couponId: string }>> {
  const parsed = createCouponSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { code, planId, discountType, discountValue, maxRedemptions, maxRedemptionsPerUser, expiresAt } = parsed.data

  if (discountType === 'percent' && discountValue > 100)
    return { success: false, error: 'Percent discount cannot exceed 100' }

  // If scoped to a plan, verify the owner actually owns that plan — RLS
  // would reject the coupon INSERT anyway via owner_id, but this gives a
  // clean error message instead of a generic DB failure, and stops a coupon
  // ever being created pointing at someone else's plan_id.
  if (planId) {
    const { data: plan } = await supabase.from('plans').select('id').eq('id', planId).eq('owner_id', user.id).maybeSingle()
    if (!plan) return { success: false, error: 'Plan not found' }
  }

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      owner_id:                  user.id,
      code:                      code.toUpperCase(),
      plan_id:                   planId ?? null,
      discount_type:             discountType,
      discount_value:            discountValue,
      max_redemptions:           maxRedemptions ?? null,
      max_redemptions_per_user:  maxRedemptionsPerUser,
      expires_at:                expiresAt ?? null,
    } as never)
    .select('id')
    .single()

  if (error || !data) {
    if ((error as any)?.code === '23505')   // unique_violation on (owner_id, code)
      return { success: false, error: 'You already have a coupon with this code' }
    logError('createCoupon', 'Insert failed', error)
    return { success: false, error: error?.message ?? 'Failed to create coupon' }
  }

  log('createCoupon', `coupon=${(data as any).id} code=${code.toUpperCase()} owner=${user.id}`)
  revalidatePath('/dashboard/coupons')
  return { success: true, data: { couponId: (data as any).id } }
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOGGLE COUPON ACTIVE
═══════════════════════════════════════════════════════════════════════════ */

export async function toggleCouponActive(couponId: string, isActive: boolean): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('coupons')
    .update({ is_active: isActive } as never)
    .eq('id', couponId)
    .eq('owner_id', user.id)   // RLS already enforces this — kept explicit for a clean error path

  if (error) { logError('toggleCouponActive', 'Update failed', error); return { success: false, error: error.message } }

  revalidatePath('/dashboard/coupons')
  return { success: true, data: undefined }
}
