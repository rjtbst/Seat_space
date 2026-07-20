// src/lib/supabase/service.ts
/**
 * Service-role Supabase client.
 *
 * Use this ONLY in trusted server-only contexts that must write data
 * regardless of RLS:
 *   - Razorpay webhooks (booking payment + subscription webhooks) — these
 *     run with no logged-in user at all, so the regular cookie-based client
 *     (createServerSupabaseClient) has no auth.uid() and depends entirely on
 *     RLS policies happening to allow an anonymous write, which is fragile
 *     and was the root cause of silently-failing webhook/cron writes.
 *   - pg_cron-triggered API routes (payout sweep, subscription reminders).
 *   - Admin server actions that need to read/write across every owner's
 *     data (e.g. listing all libraries, all payments) — paired with an
 *     explicit `requireActionRole('admin')` check before this client is
 *     ever touched. The service-role key bypasses RLS entirely, so the
 *     authorization check MUST happen in application code first; never
 *     expose this client to anything reachable without that check.
 *
 * NEVER import this into a Client Component or anything that ships to the
 * browser — SUPABASE_SERVICE_ROLE_KEY must stay server-only.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

let cached: ReturnType<typeof createClient<Database>> | null = null

export function createServiceSupabaseClient() {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — service-role client cannot be created. Set SUPABASE_SERVICE_ROLE_KEY in your environment (Supabase dashboard → Project Settings → API → service_role key). Never expose this key to the client.'
    )
  }

  cached = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return cached
}
