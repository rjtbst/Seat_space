// src/lib/chat/tools/owner.tools.ts
//
// getDashboardStats/getTodayBookings/getSeatLayout only check "is someone
// logged in", not "does this owner actually own this library" — they rely
// on RLS for that. We don't want tool execution's only line of defense to
// be RLS the LLM never sees, so every handler here re-verifies the
// requested libraryId is actually one of ctx's own libraries (via
// getOwnerLibraries) before calling through. If the LLM's libraryId doesn't
// match, the tool returns an error object instead of calling the action —
// it's simply refused, not silently redirected to "your" library, so a
// confused/malicious argument fails loudly rather than fetching different
// data than what was asked for.

import { getOwnerLibraries, getDashboardStats, getTodayBookings, getSeatLayout } from '@/lib/actions/owner'
import { getLibrarySubscribers } from '@/lib/actions/owner/subscribers'
import { getOwnerCoupons } from '@/lib/actions/owner/coupons'
import { getPayoutSetup } from '@/lib/actions/payout-setup'
import { getMyPayouts } from '@/lib/actions/owner/payout'
import type { ToolDefinition } from './types'

async function assertOwnsLibrary(libraryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const libraries = await getOwnerLibraries()
  if (!libraries.some((l) => l.id === libraryId)) {
    return { ok: false, error: 'That library id does not belong to the current owner.' }
  }
  return { ok: true }
}

const libraryIdParam = {
  libraryId: { type: 'string', description: "The owner's library UUID. If unknown, call listMyLibraries first." },
}

export const ownerTools: ToolDefinition[] = [
  {
    name: 'listMyLibraries',
    description: "List all libraries owned by the current owner, with basic stats (seats, members, this month's revenue, status).",
    parameters: { type: 'object', properties: {} },
    roles: ['owner'],
    handler: async () => {
      const libraries = await getOwnerLibraries()
      return {
        libraries: libraries.map((l) => ({
          id: l.id,
          name: l.name,
          city: l.city,
          area: l.area,
          total_seats: l.total_seats,
          active_seats: l.active_seats,
          member_count: l.member_count,
          month_total_revenue: l.month_total_revenue,
          display_status: l.display_status,
        })),
      }
    },
  },
  {
    name: 'getTodaysBookings',
    description: "Get today's bookings for one of the owner's libraries.",
    parameters: { type: 'object', properties: libraryIdParam, required: ['libraryId'] },
    roles: ['owner'],
    handler: async (args: { libraryId: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      const bookings = await getTodayBookings(args.libraryId)
      return { bookings: bookings.slice(0, 30) }
    },
  },
  {
    name: 'getOccupancySummary',
    description: "Get today's occupancy summary (occupied/active/held seats, occupancy %) for one of the owner's libraries.",
    parameters: { type: 'object', properties: libraryIdParam, required: ['libraryId'] },
    roles: ['owner'],
    handler: async (args: { libraryId: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      const stats = await getDashboardStats(args.libraryId)
      if (!stats) return { error: 'No stats available.' }
      return {
        occupancy_pct: stats.occupancy_pct,
        occupied_seats: stats.occupied_seats,
        total_active_seats: stats.total_active_seats,
        held_seats: stats.held_seats,
      }
    },
  },
  {
    name: 'getRevenueSummary',
    description: "Get today vs yesterday revenue and booking counts for one of the owner's libraries.",
    parameters: { type: 'object', properties: libraryIdParam, required: ['libraryId'] },
    roles: ['owner'],
    handler: async (args: { libraryId: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      const stats = await getDashboardStats(args.libraryId)
      if (!stats) return { error: 'No stats available.' }
      return {
        today_revenue: stats.today_revenue,
        yesterday_revenue: stats.yesterday_revenue,
        today_bookings: stats.today_bookings,
        yesterday_bookings: stats.yesterday_bookings,
        total_members: stats.total_members,
        new_members_month: stats.new_members_month,
      }
    },
  },
  {
    name: 'getSeatAvailabilitySummary',
    description: "Get the seat layout status (active/inactive/occupied) summary for one of the owner's libraries.",
    parameters: { type: 'object', properties: libraryIdParam, required: ['libraryId'] },
    roles: ['owner'],
    handler: async (args: { libraryId: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      const seats = await getSeatLayout(args.libraryId)
      const active = seats.filter((s: any) => s.is_active)
      return { total_seats: seats.length, active_seats: active.length, inactive_seats: seats.length - active.length }
    },
  },
  {
    name: 'searchStudents',
    description: "Search the owner's active/pending/expired subscribers for one of their libraries, optionally by name.",
    parameters: {
      type: 'object',
      properties: {
        ...libraryIdParam,
        nameQuery: { type: 'string', description: 'Optional partial name to filter by.' },
      },
      required: ['libraryId'],
    },
    roles: ['owner'],
    handler: async (args: { libraryId: string; nameQuery?: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      let subscribers = await getLibrarySubscribers(args.libraryId)
      if (args.nameQuery) {
        const q = args.nameQuery.toLowerCase()
        subscribers = subscribers.filter((s) => s.studentName.toLowerCase().includes(q))
      }
      return { subscribers: subscribers.slice(0, 20) }
    },
  },
  {
    name: 'getActiveSubscriptions',
    description: "Get active member subscriptions for one of the owner's libraries.",
    parameters: { type: 'object', properties: libraryIdParam, required: ['libraryId'] },
    roles: ['owner'],
    handler: async (args: { libraryId: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      const subscribers = await getLibrarySubscribers(args.libraryId)
      const active = subscribers.filter((s) => s.status === 'active' && !s.isExpired)
      return { active_count: active.length, subscribers: active.slice(0, 20) }
    },
  },
  {
    name: 'getPendingRenewals',
    description: "Get subscriptions expiring soon or already expired for one of the owner's libraries.",
    parameters: { type: 'object', properties: libraryIdParam, required: ['libraryId'] },
    roles: ['owner'],
    handler: async (args: { libraryId: string }) => {
      const check = await assertOwnsLibrary(args.libraryId)
      if (!check.ok) return check
      const subscribers = await getLibrarySubscribers(args.libraryId)
      const attention = subscribers.filter((s) => s.isExpired || s.status === 'pending')
      return { count: attention.length, subscribers: attention.slice(0, 20) }
    },
  },
  {
    name: 'getCouponSummary',
    description: 'Get a summary of the current owner\u2019s discount coupons across all their libraries (active/inactive, redemptions).',
    parameters: { type: 'object', properties: {} },
    roles: ['owner'],
    handler: async () => {
      const coupons = await getOwnerCoupons()
      return {
        active_count: coupons.filter((c) => c.isActive).length,
        coupons: coupons.slice(0, 20).map((c) => ({
          code: c.code,
          planName: c.planName,
          discountType: c.discountType,
          discountValue: c.discountValue,
          timesRedeemed: c.timesRedeemed,
          isActive: c.isActive,
          expiresAt: c.expiresAt,
        })),
      }
    },
  },
  {
    name: 'getPayoutSetupStatus',
    description: "Check whether the owner has finished payout setup (bank account or UPI/VPA on file) — required before any money can be transferred to them.",
    parameters: { type: 'object', properties: {} },
    roles: ['owner'],
    handler: async () => {
      const setup = await getPayoutSetup()
      if (!setup) return { error: 'Could not load payout setup.' }
      return {
        has_bank_account: setup.hasBankAccount,
        has_vpa: setup.hasVpa,
        default_method: setup.payoutDefaultMethod,
        bank_account_last4: setup.payoutBankAccountNumber,
      }
    },
  },
  {
    name: 'getMyPayoutHistory',
    description: "Get the owner's own recent payout runs — status (held/eligible/pending/processing/completed/failed/reversed), amounts, and dates, to answer 'when will my money arrive'.",
    parameters: { type: 'object', properties: {} },
    roles: ['owner'],
    handler: async () => {
      const payouts = await getMyPayouts(20)
      return { payouts }
    },
  },
]
