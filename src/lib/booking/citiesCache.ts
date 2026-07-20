// src/lib/booking/citiesCache.ts
/**
 * Cached "distinct active cities" list for the explore page's city filter
 * dropdown. This data changes only when a library is newly published or
 * deactivated in a city that previously had zero/nonzero active libraries —
 * effectively static from request to request — but exploreLibraries() was
 * re-querying it on every single explore page load, filter change, and
 * pagination click.
 *
 * Uses createCacheSupabaseClient() (anon key, no cookies) — same reasoning
 * as fetchActiveSlotConfigsCached in slotConfigService.ts: this must never
 * capture a request-scoped, cookie-bound client, and the query itself
 * (`libraries` where is_active = true) is covered by the public
 * "public_libraries" RLS policy, so it returns nothing a logged-out visitor
 * couldn't already see directly.
 *
 * Revalidated whenever a library's is_active or city changes — see
 * revalidateCitiesCache() callers in lib/actions/owner.ts (publishLibrary /
 * unpublishLibrary / any action that can change is_active or city).
 */

import { unstable_cache, revalidateTag } from 'next/cache'
import { createCacheSupabaseClient } from '../supabase/cache-clients'

const CITIES_CACHE_TAG = 'active-cities'

async function fetchActiveCities(): Promise<string[]> {
  const supabase = createCacheSupabaseClient()
  const { data } = await supabase
    .from('libraries')
    .select('city')
    .eq('is_active', true)
    .not('city', 'is', null)

  return [
    ...new Set((data ?? []).map((c: any) => c.city as string).filter(Boolean)),
  ].sort()
}

/**
 * Cached list of distinct cities with at least one active library.
 * Safety-net revalidation every 10 minutes even if a revalidateCitiesCache()
 * call is ever missed; in normal operation the explicit invalidation below
 * keeps this fresh immediately after any relevant change.
 */
export async function getActiveCitiesCached(): Promise<string[]> {
  const cached = unstable_cache(
    fetchActiveCities,
    ['active-cities-list'],
    { revalidate: 600, tags: [CITIES_CACHE_TAG] },
  )
  return cached()
}

/**
 * Call after any change that could add/remove a city from the active list:
 * publishing a library, unpublishing/deactivating one, or an owner editing
 * a library's city while it's active.
 */
export function revalidateCitiesCache(): void {
  revalidateTag(CITIES_CACHE_TAG)
}