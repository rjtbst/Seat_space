// lib/actions/student-profile.ts
'use server'

/**
 * Student server actions — student account profile, stats, payment receipts, and phone lookup.
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
import { computeEscrowSplit, computeFeeOnTopSplit, DEFAULT_COMMISSION_BPS } from '@/lib/booking/escrow'
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

export type StudentProfile = {
  id:         string
  name:       string | null
  full_name:  string | null
  email:      string | null
  phone:      string | null
  city:       string | null
  state:      string | null
  onboarded:  boolean
  created_at: string | null
}

export type StudentStats = {
  total_bookings:    number
  upcoming_bookings: number
  month_sessions:    number
  active_subs:       number
}

export type PaymentRecord = {
  id:                  string
  amount:              number
  base_amount:         number | null  // library's price component (null = walk-in/legacy, no fee applies)
  platform_fee:        number | null  // fee component, derived from amount - base_amount
  refunded_amount:     number         // sum of pending/processing/completed refunds against this payment (0 if none)
  status:              string
  created_at:          string
  razorpay_payment_id: string | null
  razorpay_order_id:   string | null
  type:                'booking' | 'subscription'
  booking:             {
    id:           string
    start_time:   string
    end_time:     string
    seat_label:   string
    library_name: string
  } | null
}

export type UserLookup = {
  id:       string
  fullName: string
  phone:    string | null
  email:    string | null
}


/* ══════════════════════════════════════════════════════════════════════════
   GET / UPDATE STUDENT PROFILE
══════════════════════════════════════════════════════════════════════════ */

export async function getStudentProfile(): Promise<StudentProfile | null> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('id, name, full_name, email, phone, city, state, onboarded, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null

  return {
    id:         (data as any).id,
    name:       (data as any).name       ?? null,
    full_name:  (data as any).full_name  ?? null,
    email:      (data as any).email      ?? null,
    phone:      (data as any).phone      ?? null,
    city:       (data as any).city       ?? null,
    state:      (data as any).state      ?? null,
    onboarded:  (data as any).onboarded  ?? false,
    created_at: (data as any).created_at ?? null,
  }
}

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  city:      z.string().max(100).optional(),
  state:     z.string().max(100).optional(),
})

export async function updateStudentProfile(
  input: z.infer<typeof updateProfileSchema>,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const update: Record<string, string> = {}
  if (parsed.data.full_name !== undefined) update.full_name = parsed.data.full_name.trim()
  if (parsed.data.city      !== undefined) update.city      = parsed.data.city.trim()
  if (parsed.data.state     !== undefined) update.state     = parsed.data.state

  const { error } = await supabase.from('users').update(update as never).eq('id', user.id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/profile')
  return { success: true, data: undefined }
}


/* ══════════════════════════════════════════════════════════════════════════
   GET STUDENT STATS
══════════════════════════════════════════════════════════════════════════ */

export async function getStudentStats(): Promise<StudentStats | null> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return null

  const now            = nowIST()
  const { start: mStart } = monthRangeIST()

  const [totalRes, upcomingRes, monthRes, subRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'checked_in', 'completed'] as never[]),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('end_time', now)
      .in('status', ['confirmed', 'held'] as never[]),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('start_time', mStart)
      .in('status', ['confirmed', 'checked_in', 'completed'] as never[]),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active' as never),
  ])

  return {
    total_bookings:    totalRes.count    ?? 0,
    upcoming_bookings: upcomingRes.count ?? 0,
    month_sessions:    monthRes.count    ?? 0,
    active_subs:       subRes.count      ?? 0,
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   GET MY PAYMENTS
══════════════════════════════════════════════════════════════════════════ */

export async function getMyPayments(): Promise<PaymentRecord[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data, error } = await (supabase as any)
    .from('payments')
    .select(`
      id, amount, base_amount, status, created_at,
      razorpay_payment_id, razorpay_order_id,
      subscription_id,
      bookings(
        id, start_time, end_time,
        seats(row_label, column_number),
        libraries(name)
      ),
      refunds(amount, status)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60)

  if (error || !data) return []

  return (data as any[]).map((p): PaymentRecord => {
    const bk = p.bookings as any
    const baseAmount = p.base_amount != null ? Number(p.base_amount) : null
    const refundedAmount = ((p.refunds ?? []) as any[])
      .filter((r) => ['pending', 'processing', 'completed'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
    return {
      id:                  p.id,
      amount:              Number(p.amount ?? 0),
      base_amount:         baseAmount,
      platform_fee:        baseAmount != null ? Number(p.amount ?? 0) - baseAmount : null,
      refunded_amount:     refundedAmount,
      status:              p.status     ?? '',
      created_at:          p.created_at ?? '',
      razorpay_payment_id: p.razorpay_payment_id ?? null,
      razorpay_order_id:   p.razorpay_order_id   ?? null,
      type:                p.subscription_id ? 'subscription' : 'booking',
      booking: bk ? {
        id:           bk.id,
        start_time:   bk.start_time ?? '',
        end_time:     bk.end_time   ?? '',
        seat_label:   bk.seats
          ? `${bk.seats.row_label}${bk.seats.column_number}`
          : '?',
        library_name: bk.libraries?.name ?? 'Unknown',
      } : null,
    }
  })
}


/* ══════════════════════════════════════════════════════════════════════════
   LOOKUP USER BY PHONE
══════════════════════════════════════════════════════════════════════════ */

export async function lookupUserByPhone(phone: string): Promise<UserLookup | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // caller must be authenticated staff

  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return null

  const { data } = await supabase
    .from('users')
    .select('id, full_name, phone, email')
    .ilike('phone', `%${cleaned.slice(-10)}`)
    .maybeSingle()

  if (!data) return null
  return {
    id:       data.id,
    fullName: data.full_name ?? '',
    phone:    data.phone ?? null,
    email:    data.email ?? null,
  }
}
