// lib/actions/admin-dashboard.ts
'use server'

/**
 * Admin platform dashboard — reads from the analytics views created in
 * migration 20260626130500_platform_analytics_views.sql. Those views
 * already bake in a `WHERE public.is_admin()` guard, but we ALSO gate
 * every function here with requireActionRole('admin') as the primary,
 * intended-by-design check (the view guard is defense in depth, not the
 * main mechanism — see migration comments).
 */

import { requireActionRole } from '@/lib/auth/guards'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

export type PlatformOverview = {
  totalLibraries: number
  activeLibraries: number
  pendingApprovals: number
  suspendedLibraries: number
  totalStudents: number
  totalOwners: number
  totalStaff: number
  totalGmv: number
  totalBookingCommissionRevenue: number
  totalOwnerPayouts: number  // what owners actually receive/received — the third of the three headline money numbers
  totalSubscriptionRevenue: number
  totalPlatformRevenue: number // commission + subscription
  activeSubscriptions: number
  pastDueSubscriptions: number
  bookingsToday: number
  bookingsLast7d: number
  bookingsLast30d: number
  pendingRefunds: number
  refundedLast30d: number
}

export async function getPlatformOverview(): Promise<ActionResult<PlatformOverview>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase.from('platform_overview').select('*').maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) {
    return {
      success: true,
      data: {
        totalLibraries: 0, activeLibraries: 0, pendingApprovals: 0, suspendedLibraries: 0,
        totalStudents: 0, totalOwners: 0, totalStaff: 0, totalGmv: 0,
        totalBookingCommissionRevenue: 0, totalOwnerPayouts: 0, totalSubscriptionRevenue: 0, totalPlatformRevenue: 0,
        activeSubscriptions: 0, pastDueSubscriptions: 0,
        bookingsToday: 0, bookingsLast7d: 0, bookingsLast30d: 0,
        pendingRefunds: 0, refundedLast30d: 0,
      },
    }
  }

  const d = data as any
  return {
    success: true,
    data: {
      totalLibraries: d.total_libraries ?? 0,
      activeLibraries: d.active_libraries ?? 0,
      pendingApprovals: d.pending_approvals ?? 0,
      suspendedLibraries: d.suspended_libraries ?? 0,
      totalStudents: d.total_students ?? 0,
      totalOwners: d.total_owners ?? 0,
      totalStaff: d.total_staff ?? 0,
      totalGmv: Number(d.total_gmv ?? 0),
      totalBookingCommissionRevenue: Number(d.total_booking_commission_revenue ?? 0),
      totalOwnerPayouts: Number(d.total_owner_payouts ?? 0),
      totalSubscriptionRevenue: Number(d.total_subscription_revenue ?? 0),
      totalPlatformRevenue: Number(d.total_booking_commission_revenue ?? 0) + Number(d.total_subscription_revenue ?? 0),
      activeSubscriptions: d.active_subscriptions ?? 0,
      pastDueSubscriptions: d.past_due_subscriptions ?? 0,
      bookingsToday: d.bookings_today ?? 0,
      bookingsLast7d: d.bookings_last_7d ?? 0,
      bookingsLast30d: d.bookings_last_30d ?? 0,
      pendingRefunds: d.pending_refunds ?? 0,
      refundedLast30d: Number(d.refunded_last_30d ?? 0),
    },
  }
}

export type TrendPoint = { date: string; [key: string]: string | number }

export async function getBookingTrend(): Promise<ActionResult<TrendPoint[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('daily_booking_trend')
    .select('*')
    .order('day', { ascending: true })

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      date: r.day,
      bookings: r.bookings_count ?? 0,
      completed: r.completed_count ?? 0,
      cancelled: r.cancelled_count ?? 0,
      noShow: r.no_show_count ?? 0,
    })),
  }
}

export async function getRevenueTrend(): Promise<ActionResult<TrendPoint[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('daily_revenue_trend')
    .select('*')
    .order('day', { ascending: true })

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      date: r.day,
      gmv: Number(r.gmv ?? 0),
      commission: Number(r.commission_revenue ?? 0),
      subscriptionRevenue: Number(r.subscription_revenue ?? 0),
      platformRevenue: Number(r.commission_revenue ?? 0) + Number(r.subscription_revenue ?? 0),
    })),
  }
}

export async function getUserGrowthTrend(): Promise<ActionResult<TrendPoint[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('daily_user_growth')
    .select('*')
    .order('day', { ascending: true })

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      date: r.day,
      students: r.new_students ?? 0,
      owners: r.new_owners ?? 0,
      staff: r.new_staff ?? 0,
    })),
  }
}

export type Granularity = 'daily' | 'weekly' | 'monthly'

export async function getPlatformTrend(granularity: Granularity): Promise<ActionResult<TrendPoint[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  if (granularity === 'weekly') {
    const { data, error } = await supabase.from('weekly_platform_trend').select('*').order('week_start', { ascending: true })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []).map((r: any) => ({ date: r.week_start, bookings: r.bookings_count ?? 0, gmv: Number(r.gmv ?? 0) })) }
  }

  if (granularity === 'monthly') {
    const { data, error } = await supabase.from('monthly_platform_trend').select('*').order('month_start', { ascending: true })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []).map((r: any) => ({ date: r.month_start, bookings: r.bookings_count ?? 0, gmv: Number(r.gmv ?? 0) })) }
  }

  const { data, error } = await supabase.from('daily_revenue_trend').select('*').order('day', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map((r: any) => ({ date: r.day, bookings: 0, gmv: Number(r.gmv ?? 0) })) }
}
