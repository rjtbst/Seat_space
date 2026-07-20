// src/repositories/libraries.repository.ts
/**
 * Pure data-access layer for the `libraries` table — ownership-check
 * queries only (Phase 6 / Priority 3 rollout, following the seats
 * repository pilot).
 *
 * Scope note: `libraries` is queried far more widely than this file covers
 * — library detail pages, admin list views, and public discovery all run
 * their own multi-join selects that are each genuinely distinct (different
 * columns, different joins, different callers). Pulling those into "one
 * repository" would just relocate 60+ one-off queries into a single huge
 * file without removing any actual duplication — the opposite of this
 * pattern's purpose. This file only covers the THREE query shapes that
 * were verified to repeat verbatim across multiple files:
 *
 *   - getLibraryOwnerId          — 12 call sites (owner/* action files)
 *   - getLibraryOwnerIdAndName   —  4 call sites (admin-libraries.ts)
 *   - isLibraryOwnedBy           —  4 call sites (library.ts)
 *
 * Same rules as seats.repository.ts: query shape only, no permission
 * decisions, no logging, no revalidatePath. The caller still decides what
 * "not owned" means for its own response (401 vs 404 vs silent empty list).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Owner id only — the most common check in the codebase: "does the current
 * user own this library?" Caller compares the result to their own user.id.
 */
export async function getLibraryOwnerId(
  supabase: TypedSupabaseClient,
  libraryId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('libraries').select('owner_id').eq('id', libraryId).maybeSingle()
  return (data as any)?.owner_id ?? null
}

/**
 * Owner id + name — used by admin actions that need the library's name for
 * an audit-log message or notification alongside the ownership check.
 */
export async function getLibraryOwnerIdAndName(
  supabase: TypedSupabaseClient,
  libraryId: string,
): Promise<{ owner_id: string | null; name: string | null } | null> {
  const { data } = await supabase
    .from('libraries').select('owner_id, name').eq('id', libraryId).maybeSingle()
  return (data as any) ?? null
}

/**
 * Boolean ownership check via a combined filter (id + owner_id) instead of
 * fetch-then-compare — relies on RLS/query filtering rather than an
 * application-level equality check. Returns true if the library exists AND
 * is owned by userId.
 */
export async function isLibraryOwnedBy(
  supabase: TypedSupabaseClient,
  libraryId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('libraries').select('id').eq('id', libraryId).eq('owner_id', userId).maybeSingle()
  return !!data
}
