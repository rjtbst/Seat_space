// src/repositories/seats.repository.ts
/**
 * Pure data-access layer for the `seats` table.
 *
 * Before this file, 9 files independently wrote `supabase.from('seats')...`
 * queries — 24 call sites total, several re-implementing the exact same
 * query shape (e.g. "seat by id with library_id + is_active" appeared 5
 * times, "row-label existence check" appeared twice with near-identical
 * code). A schema change to `seats` meant hunting through all 9 files by
 * hand. See architecture audit, Phase 5 / Priority 3 (repository layer
 * pilot).
 *
 * Rules for this file, matching the audit's own "no unnecessary
 * abstractions" principle:
 *   - Query shape only. No permission checks, no business rules, no
 *     revalidatePath, no logging — those stay in the calling action, which
 *     knows WHO is asking and WHY.
 *   - Returns typed rows or plain values, not ActionResult — callers decide
 *     how to translate a null/error into their own response shape.
 *   - One function per DISTINCT query shape actually used in the codebase,
 *     not one per call site — call sites with identical query shapes share
 *     a function (that's the whole point).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type TypedSupabaseClient = SupabaseClient<Database>

export type SeatBasic = {
  id:         string
  library_id: string
  is_active:  boolean
}

export type SeatLayoutRow = {
  id:            string
  row_label:     string
  column_number: number
  is_active:     boolean
}

export type SeatStatus = { id: string; is_active: boolean }
export type SeatStatusWithLibrary = { id: string; library_id: string; is_active: boolean }

/**
 * Single seat lookup by id. Used before every booking action (owner manual
 * booking, staff manual booking, student booking, seat toggles) to confirm
 * the seat exists, belongs to the claimed library, and is active — the
 * caller does the library-match/is_active checks itself, since the error
 * message for each differs by role ("Seat not found" vs "Seat not found in
 * this library" vs "Access denied").
 */
export async function getSeatById(
  supabase: TypedSupabaseClient,
  seatId: string,
): Promise<SeatBasic | null> {
  const { data } = await supabase
    .from('seats')
    .select('id, library_id, is_active')
    .eq('id', seatId)
    .maybeSingle()
  return (data as SeatBasic | null) ?? null
}

/**
 * Seat + owning library's owner_id in one query — used by owner-side
 * actions (toggleSeatActive) that need to verify the current user owns the
 * library before mutating the seat.
 */
export async function getSeatWithLibraryOwner(
  supabase: TypedSupabaseClient,
  seatId: string,
): Promise<{ id: string; library_id: string; ownerId: string | null } | null> {
  const { data } = await supabase
    .from('seats')
    .select('id, library_id, libraries(owner_id)')
    .eq('id', seatId)
    .maybeSingle()
  if (!data) return null
  const raw = (data as any).libraries
  const ownerId = Array.isArray(raw) ? raw[0]?.owner_id ?? null : raw?.owner_id ?? null
  return { id: (data as any).id, library_id: (data as any).library_id, ownerId }
}

/**
 * Full seat layout for a library — the seat-manager grid query, used
 * identically by owner, staff, and (with activeOnly) student booking flows.
 */
export async function listSeatLayout(
  supabase: TypedSupabaseClient,
  libraryId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<SeatLayoutRow[]> {
  let query = supabase
    .from('seats')
    .select('id, row_label, column_number, is_active')
    .eq('library_id', libraryId)

  if (opts.activeOnly) query = query.eq('is_active', true)

  const { data } = await query.order('row_label').order('column_number')
  return (data as SeatLayoutRow[] | null) ?? []
}

/** Lightweight id/is_active list — dashboard occupancy stats, one library. */
export async function listSeatStatus(
  supabase: TypedSupabaseClient,
  libraryId: string,
): Promise<SeatStatus[]> {
  const { data } = await supabase
    .from('seats')
    .select('id, is_active')
    .eq('library_id', libraryId)
  return (data as SeatStatus[] | null) ?? []
}

/** Same as listSeatStatus but batched across multiple libraries — owner's "My Libraries" overview. */
export async function listSeatStatusForLibraries(
  supabase: TypedSupabaseClient,
  libraryIds: string[],
): Promise<SeatStatusWithLibrary[]> {
  if (libraryIds.length === 0) return []
  const { data } = await supabase
    .from('seats')
    .select('id, library_id, is_active')
    .in('library_id', libraryIds)
  return (data as SeatStatusWithLibrary[] | null) ?? []
}

/** Seat count for a library — activeOnly for the public library detail page, unfiltered for admin. */
export async function countSeats(
  supabase: TypedSupabaseClient,
  libraryId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<number> {
  let query = supabase
    .from('seats')
    .select('*', { count: 'exact', head: true })
    .eq('library_id', libraryId)

  if (opts.activeOnly) query = query.eq('is_active', true)

  const { count } = await query
  return count ?? 0
}

/** Row-label collision check — used by both add-row and edit-row (rename) flows. */
export async function rowLabelExists(
  supabase: TypedSupabaseClient,
  libraryId: string,
  rowLabel: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('seats')
    .select('id')
    .eq('library_id', libraryId)
    .eq('row_label', rowLabel)
    .limit(1)
  return !!data?.length
}

/** Bulk-insert new seats (add-row flow). */
export async function insertSeats(
  supabase: TypedSupabaseClient,
  seats: { library_id: string; row_label: string; column_number: number; is_active: boolean }[],
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('seats').insert(seats as never)
  return { error }
}

/** Toggle a single seat's active flag. */
export async function setSeatActive(
  supabase: TypedSupabaseClient,
  seatId: string,
  isActive: boolean,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('seats')
    .update({ is_active: isActive } as never)
    .eq('id', seatId)
  return { error }
}

/** Rename every seat in a row (edit-row flow, label change). */
export async function renameSeatRow(
  supabase: TypedSupabaseClient,
  libraryId: string,
  oldLabel: string,
  newLabel: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('seats')
    .update({ row_label: newLabel } as never)
    .eq('library_id', libraryId)
    .eq('row_label', oldLabel)
  return { error }
}

/** All seats in one row, ordered — used by edit-row to compute grow/shrink diff. */
export async function listSeatsInRow(
  supabase: TypedSupabaseClient,
  libraryId: string,
  rowLabel: string,
): Promise<{ id: string; column_number: number }[]> {
  const { data } = await supabase
    .from('seats')
    .select('id, column_number')
    .eq('library_id', libraryId)
    .eq('row_label', rowLabel)
    .order('column_number')
  return (data as { id: string; column_number: number }[] | null) ?? []
}

/** Delete seats by id (edit-row shrink flow). */
export async function deleteSeatsByIds(
  supabase: TypedSupabaseClient,
  seatIds: string[],
): Promise<{ error: { message: string } | null }> {
  if (seatIds.length === 0) return { error: null }
  const { error } = await supabase.from('seats').delete().in('id', seatIds)
  return { error }
}
