// src/lib/booking/amenitiesCache.ts
/**
 * Cached "all amenities" list for the explore page's amenity filter.
 *
 * The `amenities` table is a small, effectively-static reference list —
 * there's no owner/admin mutation path that inserts or renames rows in
 * normal operation (owners only write to the `library_amenities` join
 * table when selecting amenities for their library). getAllAmenities()
 * was re-querying it on every single /explore page load regardless.
 *
 * Uses createCacheSupabaseClient() (anon key, no cookies) — same reasoning
 * as citiesCache.ts / slotConfigService.ts: this must never capture a
 * request-scoped, cookie-bound client, and the query itself is covered by
 * the public "public_view_amenities" RLS policy (`USING (true)`), so it
 * returns nothing a logged-out visitor couldn't already see directly.
 *
 * No explicit revalidation hook is wired up because nothing in the app
 * currently writes to this table — the 1-hour safety-net revalidation
 * below is deliberately the only invalidation path. If an admin "manage
 * amenities" feature is added later, call revalidateAmenitiesCache() from
 * it, the same way revalidateCitiesCache() is called from
 * publish/unpublish.
 */

import { unstable_cache, revalidateTag } from 'next/cache'
import { createCacheSupabaseClient } from '../supabase/cache-clients'

const AMENITIES_CACHE_TAG = 'all-amenities'

async function fetchAllAmenities(): Promise<string[]> {
  const supabase = createCacheSupabaseClient()
  const { data } = await supabase.from('amenities').select('name').order('name')
  return (data ?? []).map((a: any) => a.name as string).filter(Boolean)
}

/**
 * Cached list of all amenity names, for the explore page filter panel.
 * 1-hour safety-net revalidation — this data essentially never changes,
 * so a long TTL is fine; call revalidateAmenitiesCache() if/when a
 * mutation path is added instead of relying on this alone.
 */
export async function getAllAmenitiesCached(): Promise<string[]> {
  const cached = unstable_cache(
    fetchAllAmenities,
    ['all-amenities-list'],
    { revalidate: 3600, tags: [AMENITIES_CACHE_TAG] },
  )
  return cached()
}

/**
 * Call after any change to the `amenities` table (e.g. a future admin
 * "manage amenities" action) so the explore filter panel updates
 * immediately instead of waiting on the 1-hour safety net.
 */
export function revalidateAmenitiesCache(): void {
  revalidateTag(AMENITIES_CACHE_TAG)
}
