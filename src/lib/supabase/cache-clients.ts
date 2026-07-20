// src/lib/supabase/cache-client.ts
/**
 * A plain Supabase client for use INSIDE unstable_cache() functions only.
 *
 * Why this exists, and why createServerSupabaseClient() from server.ts
 * cannot be used here:
 *
 *   - createServerSupabaseClient() reads cookies() to bind the client to
 *     the current request's user session. unstable_cache()'s result is
 *     shared across requests/users (that's the entire point of caching),
 *     so a cookie-bound client must never be created or captured inside
 *     a cached function — doing so risks leaking one user's session into
 *     a cache entry that gets reused for a different user, and calling
 *     cookies() during cache population can throw outside a request scope.
 *
 *   - This client uses only the public anon key with no session, exactly
 *     like an unauthenticated visitor. That's safe here because every
 *     query that goes through the cache layer (slot_configs, cities) is
 *     covered by a `USING (true)` / public-read RLS policy — the same
 *     data an anonymous visitor could already read directly. Nothing
 *     user-specific or permission-gated should ever be wrapped in
 *     unstable_cache with this client.
 *
 * If you need to cache something that depends on the current user's
 * identity or permissions, don't use this pattern — that data must stay
 * per-request (uncached, or cached with the user ID baked into the cache
 * key AND verified safe to share, which is rarely worth the complexity).
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export function createCacheSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession:    false,
        autoRefreshToken:  false,
      },
    },
  )
}