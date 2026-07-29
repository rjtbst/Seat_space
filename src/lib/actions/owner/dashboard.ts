'use server'

// src/lib/actions/owner/dashboard.ts
// Split from owner.ts (Phase 4 / Priority 2.1) — dashboard analytics,
// stats, revenue, today's bookings, slot heatmap, and check-in.

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log, logError, timed } from '@/lib/logger'
import {
  nowIST,
  todayRangeIST,
  yesterdayRangeIST,
  monthRangeIST,
  pastMonthsStartIST,
  getISTHour,
} from '@/lib/ist'
import { fetchActiveSlotConfigs } from '@/lib/booking/slotConfigService'
import { computeLibraryDisplayStatus, type LibraryDisplayStatus } from '@/lib/library-status'
import { getLibraryBookingRevenue } from '@/lib/booking/revenue'
import { getYesterdayRevenueCached, getMonthlyRevenueCached } from '@/lib/booking/dashboardStatsCache'
import { setBookingStatus } from '@/repositories/bookings.repository'
import { listSeatStatus, listSeatStatusForLibraries } from '@/repositories/seats.repository'

/* ═══════════════════════════════════════════════════════════════════════════
   TIMEZONE STRATEGY
   ─────────────────────────────────────────────────────────────────────────
   All users are in India (IST = Asia/Kolkata, UTC+5:30).
   DB column type: timestamp WITHOUT time zone.
   Convention:     store and compare plain IST wall-clock strings.
                   No UTC, no 'Z' suffix, no offset conversion anywhere.

   See lib/ist.ts for all timezone helpers.
═══════════════════════════════════════════════════════════════════════════ */

/* ─── In-memory group-by helper ───────────────────────────────────────────── */
function groupBy<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T,
): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const k = String(item[key])
    ;(out[k] ??= []).push(item)
  }
  return out
}

/* ═══════════════════════════════════════════════════════════════════════════
   OWNER LIBRARIES
═══════════════════════════════════════════════════════════════════════════ */
export type OwnerLibrary = {
  id: string
  name: string
  city: string
  area: string
  is_active: boolean
  cover_url: string | null
  total_seats: number
  active_seats: number
  member_count: number
  staff_count: number
  /** Booking-tied revenue (online + manual + walk-in), current calendar month */
  month_revenue: number
  /** Subscription-purchase revenue attributable to this library, current calendar month */
  month_subscription_revenue: number
  /** month_revenue + month_subscription_revenue — see lib/booking/revenue.ts */
  month_total_revenue: number
  /** Draft / Payment Pending / Pending Approval / Trial / Active / Expired / Suspended — see lib/library-status.ts */
  display_status: LibraryDisplayStatus
  /** True while this library is live for free under the first-library trial (no paid subscription yet) */
  is_in_trial: boolean
  /** Days left in the first-library trial, or null if this library never had one */
  trial_days_remaining: number | null
}

export async function getOwnerLibraries(): Promise<OwnerLibrary[]> {
  return timed('getOwnerLibraries', 'fetch all libraries + stats', async () => {
    const { supabase, user } = await getSupabaseUser()
    if (!user) return []

    const { data: libs, error: libErr } = await supabase
      .from('libraries')
      .select('id, name, city, area, is_active, approval_status, trial_ends_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (libErr) { logError('getOwnerLibraries', 'Failed to fetch libraries', libErr); return [] }
    if (!libs?.length) return []

    const libIds = libs.map((l) => l.id)
    const { start: mStart, end: mEnd } = monthRangeIST()

    const [seatData, staffRes, coversRes, planLibsRes, bookingsRes, subStatusRes] = await Promise.all([
      listSeatStatusForLibraries(supabase, libIds),
      supabase.from('staff').select('library_id').in('library_id', libIds),
      supabase.from('library_images').select('library_id, image_url').in('library_id', libIds).eq('is_cover', true),
      supabase.from('plan_libraries').select('library_id, plan_id').in('library_id', libIds),
      supabase.from('bookings').select('id, library_id').in('library_id', libIds).gte('start_time', mStart).lte('start_time', mEnd),
      supabase.from('platform_subscriptions').select('library_id, status, grace_period_ends_at').in('library_id', libIds),
    ])

    const allPlanIds    = [...new Set(planLibsRes.data?.map((r) => r.plan_id) ?? [])]
    const allBookingIds = bookingsRes.data?.map((b) => b.id) ?? []

    const [subsRes, paymentsRes, subPaymentsRes] = await Promise.all([
      allPlanIds.length
        ? supabase.from('subscriptions').select('plan_id').eq('status', 'active' as never).in('plan_id', allPlanIds)
        : Promise.resolve({ data: [] as { plan_id: string }[] }),
      allBookingIds.length
        ? supabase.from('payments').select('booking_id, amount').eq('status', 'paid' as never).in('booking_id', allBookingIds)
        : Promise.resolve({ data: [] as { booking_id: string; amount: number }[] }),
      // Subscription-purchase payments for ALL of this owner's plans in ONE
      // query, instead of one query per library (see comment below). Mirrors
      // getSubscriptionRevenueForLibrary's own query in lib/booking/revenue.ts
      // exactly — same table, same filters, same join — just batched across
      // every plan at once rather than one plan-set per library.
      allPlanIds.length
        ? supabase
            .from('payments')
            .select('amount, subscriptions!inner(plan_id, created_at)')
            .eq('status', 'paid' as never)
            .is('booking_id', null)
            .in('subscriptions.plan_id', allPlanIds)
            .gte('created_at', mStart)
            .lte('created_at', mEnd)
        : Promise.resolve({ data: [] as { amount: number; subscriptions: { plan_id: string; created_at: string } }[] }),
    ])

    const seatsByLib    = groupBy(seatData, 'library_id')
    const staffByLib    = groupBy(staffRes.data ?? [], 'library_id')
    const plansByLib    = groupBy(planLibsRes.data ?? [], 'library_id')
    const bookingsByLib = groupBy(bookingsRes.data ?? [], 'library_id')

    const coverByLib: Record<string, string> = {}
    for (const r of coversRes.data ?? []) {
      if (!r.library_id || !r.image_url) continue
      if (!coverByLib[r.library_id]) coverByLib[r.library_id] = r.image_url
    }
    const subStatusByLib: Record<string, { status: string; subActive: boolean }> = {}
    for (const s of (subStatusRes.data ?? []) as any[]) {
      if (!s.library_id) continue
      const subActive = s.status === 'active' ||
        (s.status === 'past_due' && s.grace_period_ends_at && new Date(s.grace_period_ends_at) > new Date())
      subStatusByLib[s.library_id] = { status: s.status, subActive }
    }
    const subsByPlan: Record<string, number> = {}
    for (const s of subsRes.data ?? []) {
      if (!s.plan_id) continue
      subsByPlan[s.plan_id] = (subsByPlan[s.plan_id] ?? 0) + 1
    }
    const payByBooking: Record<string, number> = {}
    for (const p of paymentsRes.data ?? []) {
      if (!p.booking_id) continue
      payByBooking[p.booking_id] = Number(p.amount ?? 0)
    }

    // Subscription revenue PER PLAN (not yet per library) — summed once here,
    // then attributed to each library below via plansByLib. This preserves
    // the exact semantic documented in getSubscriptionRevenueForLibrary: a
    // 'cross' scope plan linked to multiple libraries contributes its FULL
    // payment amount to EACH linked library (not divided), so summing
    // month_subscription_revenue across all of an owner's libraries can
    // double-count a single cross-library plan purchase — that's intentional,
    // matching the original per-library function's documented behavior.
    const subRevenueByPlan: Record<string, number> = {}
    for (const row of (subPaymentsRes.data ?? []) as any[]) {
      const planId = row.subscriptions?.plan_id
      if (!planId) continue
      subRevenueByPlan[planId] = (subRevenueByPlan[planId] ?? 0) + Number(row.amount ?? 0)
    }

    return libs.map((lib) => {
      const seats      = seatsByLib[lib.id] ?? []
      const planIds    = (plansByLib[lib.id] ?? []).map((p) => p.plan_id)
      const bookingIds = (bookingsByLib[lib.id] ?? []).map((b) => b.id)
      const monthRevenue = bookingIds.reduce((sum, bid) => sum + (payByBooking[bid] ?? 0), 0)
      // Sum the full subscription-payment amount for every plan linked to
      // this library — see the double-counting note above subRevenueByPlan.
      const monthSubRevenue = planIds.reduce((sum, pid) => sum + (subRevenueByPlan[pid] ?? 0), 0)

      const trialEndsAt = (lib as any).trial_ends_at as string | null
      const isInTrial = trialEndsAt != null && new Date(trialEndsAt) > new Date()
      const trialDaysRemaining = trialEndsAt != null
        ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
        : null

      return {
        id:            lib.id,
        name:          lib.name,
        city:          lib.city ?? '',
        area:          lib.area ?? '',
        is_active:     lib.is_active ?? false,
        cover_url:     coverByLib[lib.id] ?? null,
        total_seats:   seats.length,
        active_seats:  seats.filter((s) => s.is_active).length,
        member_count:  planIds.reduce((sum, pid) => sum + (subsByPlan[pid] ?? 0), 0),
        staff_count:   (staffByLib[lib.id] ?? []).length,
        month_revenue:               monthRevenue,
        month_subscription_revenue:  monthSubRevenue,
        month_total_revenue:         monthRevenue + monthSubRevenue,
        is_in_trial:            isInTrial,
        trial_days_remaining:   trialDaysRemaining,
        display_status: computeLibraryDisplayStatus({
          approvalStatus:     (lib as any).approval_status ?? 'pending',
          isActive:           lib.is_active ?? false,
          subscriptionStatus: subStatusByLib[lib.id]?.status ?? null,
          subscriptionActive: (subStatusByLib[lib.id]?.subActive ?? false) || isInTrial,
          isInTrial,
          hadTrial: trialEndsAt != null,
        }),
      }
    })
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD STATS
═══════════════════════════════════════════════════════════════════════════ */
export type DashboardStats = {
  today_revenue: number
  yesterday_revenue: number
  today_bookings: number
  yesterday_bookings: number
  occupancy_pct: number
  occupied_seats: number
  total_active_seats: number
  held_seats: number
  total_members: number
  new_members_month: number
}

export async function getDashboardStats(libraryId: string): Promise<DashboardStats | null> {
  return timed('getDashboardStats', `library=${libraryId}`, async () => {
    const { supabase, user } = await getSupabaseUser()
    if (!user) return null

    // Explicit ownership check — required here (not just left to RLS) because
    // yesterday's revenue below goes through a service-role-backed cache
    // (dashboardStatsCache.ts) that bypasses RLS. Same convention already
    // used elsewhere in owner actions (e.g. owner/coupons.ts).
    const { data: ownedLib } = await supabase
      .from('libraries').select('id').eq('id', libraryId).eq('owner_id', user.id).maybeSingle()
    if (!ownedLib) return null

    const now       = nowIST()
    const today     = todayRangeIST()
    const yesterday = yesterdayRangeIST()
    const { start: mStart } = monthRangeIST()

    const [todayBkRes, ystBkRes, liveOccRes, seatData, planIdsRes, todayRev, ystRev] = await Promise.all([
      supabase.from('bookings').select('id, status').eq('library_id', libraryId)
        .gte('start_time', today.start).lte('start_time', today.end),
      supabase.from('bookings').select('id').eq('library_id', libraryId)
        .gte('start_time', yesterday.start).lte('start_time', yesterday.end),
      supabase.from('bookings').select('id, status, hold_expires_at').eq('library_id', libraryId)
        .lte('start_time', now).gte('end_time', now)
        .in('status', ['confirmed', 'checked_in', 'held'] as never[]),
      listSeatStatus(supabase, libraryId),
      supabase.from('plan_libraries').select('plan_id').eq('library_id', libraryId),
      // Centralized booking-revenue calculation (lib/booking/revenue.ts) —
      // same query shape used by getOwnerLibraries' month_revenue, so
      // "today's revenue" and "this month's revenue" are never computed two
      // different ways. Today's figure stays LIVE (uncached) — an owner
      // checking today's numbers mid-day expects them current. Yesterday's
      // figure is cached (60s TTL, see dashboardStatsCache.ts) since it
      // cannot change except via a refund.
      getLibraryBookingRevenue(supabase, libraryId, today.start, today.end),
      getYesterdayRevenueCached(libraryId, yesterday.start, yesterday.end),
    ])

    const planIds = planIdsRes.data?.map((r) => r.plan_id) ?? []

    const [totalMemRes, newMemRes] = await Promise.all([
      planIds.length
        ? supabase.from('subscriptions').select('id', { count: 'exact', head: true })
            .in('plan_id', planIds).eq('status', 'active' as never)
        : Promise.resolve({ count: 0 }),
      planIds.length
        ? supabase.from('subscriptions').select('id', { count: 'exact', head: true })
            .in('plan_id', planIds).gte('created_at', mStart)
        : Promise.resolve({ count: 0 }),
    ])

    const seats       = seatData
    const liveOcc     = liveOccRes.data ?? []
    const totalActive = seats.filter((s) => s.is_active).length
    const occupied    = liveOcc.filter((b) => ['confirmed', 'checked_in'].includes(b.status as string)).length
    const held        = liveOcc.filter((b) =>
      b.status === 'held' && (!b.hold_expires_at || new Date(b.hold_expires_at as string).getTime() > Date.now())
    ).length

    return {
      today_revenue:      todayRev,
      yesterday_revenue:  ystRev,
      today_bookings:     todayBkRes.data?.length ?? 0,
      yesterday_bookings: ystBkRes.data?.length ?? 0,
      occupancy_pct:      totalActive ? Math.round((occupied / totalActive) * 100) : 0,
      occupied_seats:     occupied,
      total_active_seats: totalActive,
      held_seats:         held,
      total_members:      (totalMemRes as { count: number }).count ?? 0,
      new_members_month:  (newMemRes  as { count: number }).count ?? 0,
    }
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   MONTHLY REVENUE
═══════════════════════════════════════════════════════════════════════════ */
export type MonthRevPoint = { month: string; amount: number }

export async function getMonthlyRevenue(libraryId: string): Promise<MonthRevPoint[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  // Explicit ownership check — required because the trend below goes
  // through a service-role-backed cache that bypasses RLS. See
  // getDashboardStats above / dashboardStatsCache.ts for the full reasoning.
  const { data: ownedLib } = await supabase
    .from('libraries').select('id').eq('id', libraryId).eq('owner_id', user.id).maybeSingle()
  if (!ownedLib) return []

  const since = pastMonthsStartIST(6)

  // Cached (60s TTL) — this trend cannot change except via a refund, and
  // was being recomputed via RPC on every dashboard load. See
  // dashboardStatsCache.ts.
  return getMonthlyRevenueCached(libraryId, since)
}

/* ═══════════════════════════════════════════════════════════════════════════
   TODAY'S BOOKINGS TABLE
═══════════════════════════════════════════════════════════════════════════ */
export type TodayBooking = {
  id: string
  seat_label: string
  student: string
  phone: string | null
  plan: string | null
  start_time: string
  end_time: string
  status: string
  booking_mode: 'online' | 'offline'
  // Payout visibility — null for offline/manual bookings (no online
  // payment exists to track escrow for; owner already has the cash/UPI
  // amount directly, see manualBookSeat).
  payout_amount: number | null
  payout_status: 'held' | 'eligible' | 'paid_out' | 'refunded' | 'partially_refunded' | 'not_applicable' | null
}

export async function getTodayBookings(libraryId: string): Promise<TodayBooking[]> {
  return timed('getTodayBookings', `library=${libraryId}`, async () => {
    const { supabase, user } = await getSupabaseUser()
    if (!user) return []

    const { start, end } = todayRangeIST()

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, start_time, end_time, status, booking_mode,
        guest_name, guest_phone, user_id,
        seats(row_label, column_number),
        users(full_name, phone)
      `)
      .eq('library_id', libraryId)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: true })

    if (error) { logError('getTodayBookings', 'Query failed', error); return [] }
    if (!data?.length) return []

    const memberUserIds = data
      .filter((b: any) => b.user_id && b.users)
      .map((b: any) => b.user_id as string)

    const planByUser: Record<string, string> = {}
    if (memberUserIds.length > 0) {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('user_id, plans(name)')
        .in('user_id', memberUserIds)
        .eq('status', 'active' as never)
        .limit(memberUserIds.length * 2)
      for (const s of subs ?? []) {
        const sub = s as any
        if (sub.user_id && sub.plans?.name && !planByUser[sub.user_id])
          planByUser[sub.user_id] = sub.plans.name
      }
    }

    const bookingIds = data.map((b: any) => b.id as string)
    const payoutByBooking: Record<string, { amount: number | null; status: TodayBooking['payout_status'] }> = {}
    if (bookingIds.length > 0) {
      const { data: pays } = await supabase
        .from('payments')
        .select('booking_id, amount, owner_payout_amount, escrow_status, status')
        .in('booking_id', bookingIds)
      for (const p of (pays ?? []) as any[]) {
        // A payment can be 'pending' (checkout not yet completed) — don't
        // show a misleading payout status for money that was never
        // actually captured.
        if (p.status !== 'paid' && p.status !== 'partially_refunded' && p.status !== 'refunded') continue
        payoutByBooking[p.booking_id] = {
          amount: p.owner_payout_amount != null ? Number(p.owner_payout_amount) : Number(p.amount ?? 0),
          status: p.status === 'refunded' ? 'refunded'
            : p.status === 'partially_refunded' ? 'partially_refunded'
            : (p.escrow_status as TodayBooking['payout_status']),
        }
      }
    }

    return data.map((b: any) => {
      const isGuest  = !b.user_id || !b.users
      const name     = isGuest ? (b.guest_name ?? 'Walk-in') : (b.users?.full_name ?? 'Unknown')
      const rawPhone = isGuest ? b.guest_phone : b.users?.phone
      const phone    = rawPhone
        ? String(rawPhone).replace(/^(\+?91)?(\d{2})(\d{4})(\d{4})$/, '+91 $2•••• $4')
        : null

      return {
        id:           b.id,
        seat_label:   b.seats ? `${b.seats.row_label}${b.seats.column_number}` : '?',
        student:      name,
        phone,
        plan:         isGuest ? 'Walk-in' : (planByUser[b.user_id] ?? 'Per session'),
        start_time:   b.start_time,
        end_time:     b.end_time,
        status:       b.status,
        booking_mode: b.booking_mode ?? 'offline',
        payout_amount: payoutByBooking[b.id]?.amount ?? null,
        payout_status: payoutByBooking[b.id]?.status ?? (b.booking_mode === 'offline' ? 'not_applicable' : null),
      }
    })
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   SLOT HEATMAP
   ─────────────────────────────────────────────────────────────────────────
   SLOT-ONLY ARCHITECTURE: buckets are now the library's ACTUAL configured
   slots (slot_configs), not hardcoded 3-hour display bands. A booking is
   counted in the slot whose [start,end) contains its start_time — the same
   containment rule used for pricing (lib/booking/pricing.ts) — so "slot
   popularity" on the dashboard matches the slots the owner actually
   configured (and their labels/prices), rather than an unrelated fixed grid.
═══════════════════════════════════════════════════════════════════════════ */
export type SlotBand = {
  label: string
  start_h: number
  end_h: number
  pct: number
  count: number
}

export async function getSlotHeatmap(libraryId: string): Promise<SlotBand[]> {
  return timed('getSlotHeatmap', `library=${libraryId}`, async () => {
    const { supabase, user } = await getSupabaseUser()
    if (!user) return []

    const since = pastMonthsStartIST(1)

    const [bookingsRes, slots] = await Promise.all([
      supabase
        .from('bookings')
        .select('start_time')
        .eq('library_id', libraryId)
        .gte('start_time', since)
        .in('status', ['confirmed', 'checked_in', 'completed'] as never[]),
      fetchActiveSlotConfigs(supabase, libraryId),
    ])

    if (bookingsRes.error) { logError('getSlotHeatmap', 'Query failed', bookingsRes.error); return [] }
    if (slots.length === 0) return []

    const data = bookingsRes.data ?? []

    const bands = [...slots]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((slot) => {
        const startH = parseInt(slot.start.split(':')[0] ?? '0', 10)
        const endH   = parseInt(slot.end.split(':')[0]   ?? '0', 10)
        return {
          label:   `${slot.start}–${slot.end}`,
          start_h: startH,
          end_h:   endH,
          count: data.filter((bk) => {
            if (!bk.start_time) return false
            const h = getISTHour(bk.start_time)
            // Same containment convention as the heatmap previously used —
            // hour-granularity bucketing into [start_h, end_h). Bookings
            // whose minute offset places them technically outside the slot
            // (e.g. a 09:00-09:30 slot vs a 09:45 booking start) won't occur
            // in practice since slotBoundaryValidation rejects such bookings
            // at creation time.
            return h >= startH && h < endH
          }).length,
        }
      })

    const max = Math.max(...bands.map((b) => b.count), 1)
    return bands.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }))
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHECK-IN
═══════════════════════════════════════════════════════════════════════════ */
export async function checkInBooking(bookingId: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, library_id, status, libraries(owner_id)')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchErr) { logError('checkInBooking', 'Fetch failed', fetchErr); return { success: false, error: fetchErr.message } }
  if (!booking) return { success: false, error: 'Booking not found' }

  const ownerRaw = booking?.libraries
  const ownerId  = Array.isArray(ownerRaw) ? ownerRaw[0]?.owner_id : (ownerRaw as any)?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  if (!['confirmed', 'held'].includes(booking.status as string))
    return { success: false, error: `Cannot check in — status is ${booking.status}` }

  const { error } = await setBookingStatus(supabase, bookingId, 'checked_in')

  if (error) { logError('checkInBooking', 'Update failed', error); return { success: false, error: error.message } }

  log('checkInBooking', `booking=${bookingId} checked in`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/dashboard/scanner')
  return { success: true, data: undefined }
}

/**
 * Owner equivalent of staff.ts's lookupBookingForScan — same shape and same
 * behavior, scoped via libraries(owner_id) instead of the staff table (an
 * owner has no row in `staff`, so the staff version would always reject
 * them with "Staff record not found").
 */
export async function lookupBookingForOwnerScan(bookingId: string): Promise<ActionResult<{
  id: string; seatLabel: string; studentName: string
  startTime: string; endTime: string; status: string
}>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, library_id, guest_name, user_id, libraries(owner_id), seats(row_label, column_number), users(full_name)')
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !booking) return { success: false, error: 'Booking not found' }

  const b        = booking as any
  const ownerRaw = b.libraries
  const ownerId  = Array.isArray(ownerRaw) ? ownerRaw[0]?.owner_id : ownerRaw?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Booking belongs to a different library' }

  const isGuest   = !b.user_id || !b.users
  const name      = isGuest ? (b.guest_name ?? 'Walk-in') : (b.users?.full_name ?? 'Unknown')
  const seatLabel = b.seats ? `${b.seats.row_label}${b.seats.column_number}` : '?'

  return {
    success: true,
    data: { id: b.id, seatLabel, studentName: name, startTime: b.start_time, endTime: b.end_time, status: b.status },
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET FIRST LIBRARY ID
   ─────────────────────────────────────────────────────────────────────────
   Wrapped in React cache() so that when layout.tsx and a page.tsx both call
   this within the same server render pass, only ONE DB query fires.
   The cache is per-request (not persistent) — React discards it after the
   render tree completes.
═══════════════════════════════════════════════════════════════════════════ */
export const getFirstLibraryId = cache(async (): Promise<string | null> => {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return null
  const { data } = await supabase
    .from('libraries').select('id').eq('owner_id', user.id)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (data as any)?.id ?? null
})
