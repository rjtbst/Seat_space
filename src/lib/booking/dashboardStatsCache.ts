// src/lib/booking/dashboardStatsCache.ts
/**
 * Cached owner-dashboard figures that don't need second-by-second
 * freshness: yesterday's revenue and the 6-month revenue trend.
 *
 * getDashboardStats() was running ~9 queries on every single dashboard
 * load/nav/auto-refresh, uncached. Live occupancy and today's numbers stay
 * exactly as they were (uncached, in dashboard.ts) — an owner checking who
 * is in the library right now should never see stale data. But "yesterday's
 * revenue" and the "last 6 months" trend cannot change except via a refund,
 * so they're safe to cache for a short window.
 *
 * IMPORTANT — this is NOT public data like citiesCache.ts / slotConfigService.ts.
 * This is per-owner revenue. unstable_cache's result is shared across every
 * request that hits the same cache key, regardless of who's asking — so:
 *
 *   1. This module uses the SERVICE-ROLE client (bypasses RLS), because a
 *      cached function can't safely capture a per-request cookie-bound
 *      client (see lib/supabase/cache-clients.ts for why).
 *   2. Because RLS is bypassed, the caller MUST verify the requesting user
 *      actually owns `libraryId` BEFORE calling either function below.
 *      Both getDashboardStats() and getMonthlyRevenue() in
 *      lib/actions/owner/dashboard.ts already do a `.eq('owner_id', user.id)`
 *      check as part of loading the library — do not call these functions
 *      from anywhere that skips that check.
 *   3. Cache key is per-library, not per-user — intentional, since every
 *      owner/staff member authorized for a given library sees the same
 *      numbers anyway. Never key this by anything less specific than
 *      libraryId, and never cache a query that isn't already scoped to a
 *      single libraryId.
 *
 * Revalidation: no explicit revalidateTag() hook is wired up yet (that
 * would need to fire from the Razorpay webhook / refund actions, both
 * higher-risk files to change blind). Freshness is bounded by the 60s TTL
 * below instead — worst case, yesterday's revenue is up to 60s stale after
 * a refund. If instant invalidation is needed later, call
 * revalidateDashboardStatsCache(libraryId) from wherever a payment/refund
 * for that library settles.
 */

import { unstable_cache, revalidateTag } from 'next/cache'
import { createServiceSupabaseClient } from '../supabase/service'
import { getLibraryBookingRevenue } from './revenue'

const dashboardStatsTag = (libraryId: string) => `dashboard-stats-${libraryId}`

/**
 * Cached "yesterday's revenue" figure for a single library.
 * Caller MUST have already verified the requesting user owns libraryId.
 */
export async function getYesterdayRevenueCached(
  libraryId: string,
  yesterdayStartISO: string,
  yesterdayEndISO: string,
): Promise<number> {
  const cached = unstable_cache(
    async () => {
      const supabase = createServiceSupabaseClient()
      return getLibraryBookingRevenue(supabase, libraryId, yesterdayStartISO, yesterdayEndISO)
    },
    ['dashboard-yesterday-revenue', libraryId, yesterdayStartISO, yesterdayEndISO],
    { revalidate: 60, tags: [dashboardStatsTag(libraryId)] },
  )
  return cached()
}

/**
 * Cached 6-month revenue trend (the `monthly_revenue` RPC) for a single
 * library. Caller MUST have already verified the requesting user owns
 * libraryId.
 */
export async function getMonthlyRevenueCached(
  libraryId: string,
  sinceISO: string,
): Promise<{ month: string; amount: number }[]> {
  const cached = unstable_cache(
    async () => {
      const supabase = createServiceSupabaseClient()
      const { data, error } = await supabase.rpc('monthly_revenue', {
        p_library_id: libraryId,
        p_since:      sinceISO,
      } as never)
      if (error) return []
      return (data ?? []) as { month: string; amount: number }[]
    },
    ['dashboard-monthly-revenue', libraryId, sinceISO],
    { revalidate: 60, tags: [dashboardStatsTag(libraryId)] },
  )
  return cached()
}

/**
 * Call after any payment/refund event that changes a library's settled
 * revenue, if/when instant (rather than 60s-bounded) freshness is needed.
 * Not currently wired up anywhere — see module header.
 */
export function revalidateDashboardStatsCache(libraryId: string): void {
  revalidateTag(dashboardStatsTag(libraryId))
}
