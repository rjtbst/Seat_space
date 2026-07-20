// src/lib/booking/slotConfigService.ts
/**
 * Shared data-access layer for the `slot_configs` table.
 *
 * Replaces the JSON-in-`libraries.description` approach that was previously
 * duplicated in:
 *  - lib/actions/owner.ts            (getLibMeta / getSlotConfigs / upsertSlotConfig / toggleSlotConfig)
 *  - lib/actions/staff-seat-actions.ts (getStaffLibrarySlots)
 *  - lib/libraryMeta.ts               (parseLibraryMeta)
 *
 * This module does NOT do auth/ownership checks — callers (owner.ts,
 * staff-seat-actions.ts, student.ts) are responsible for verifying the
 * current user may access `libraryId` before calling these functions.
 * This keeps the service reusable across all three roles without baking in
 * role-specific assumptions.
 */

import { logError } from '../logger'
import { type SlotConfig, type SlotConfigInput } from './types'
import { validateSlot, findSlotConflict } from './slotValidation'
import { unstable_cache, revalidateTag } from 'next/cache'
import { createCacheSupabaseClient } from '../supabase/cache-clients'

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/* ─── Row <-> domain mapping ─────────────────────────────────────────────── */

type SlotConfigRow = {
  id:         string
  library_id: string
  start_time: string  // "HH:MM:SS"
  end_time:   string
  days:       number[]
  price:      number | string
  discount:   number | string | null
  is_active:  boolean
}

function rowToSlot(row: SlotConfigRow): SlotConfig {
  return {
    id:         row.id,
    library_id: row.library_id,
    start:      row.start_time.slice(0, 5),
    end:        row.end_time.slice(0, 5),
    days:       row.days ?? [],
    price:      Number(row.price ?? 0),
    discount:   Number(row.discount ?? 0),
    is_active:  row.is_active,
  }
}

/* ─── Read ────────────────────────────────────────────────────────────────── */

/**
 * Fetch ALL slot configs (active and inactive) for a library, ordered by
 * start time. Returns [] on error rather than throwing — callers display
 * "no slots configured" in that case, same as before.
 */
export async function fetchSlotConfigs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
): Promise<SlotConfig[]> {
  const { data, error } = await supabase
    .from('slot_configs')
    .select('id, library_id, start_time, end_time, days, price, discount, is_active')
    .eq('library_id', libraryId)
    .order('start_time', { ascending: true })

  if (error) {
    logError('fetchSlotConfigs', `library=${libraryId}`, error)
    return []
  }
  return (data ?? []).map(rowToSlot)
}

/** Fetch only ACTIVE slot configs — used for pricing resolution and student-facing displays. */
export async function fetchActiveSlotConfigs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
): Promise<SlotConfig[]> {
  const all = await fetchSlotConfigs(supabase, libraryId)
  return all.filter(s => s.is_active)
}

/* ─── Cached read (for high-frequency, read-only call sites) ───────────────
 *
 * slot_configs changes a handful of times a year per library (an owner
 * editing their hours/pricing), but is read on nearly every booking-flow
 * request: every exploreLibraries() result row, every getLibraryDetail(),
 * every initiateBooking(), every price preview keystroke. Fetching it fresh
 * from Postgres every time is the single most repeated "hot but rarely
 * changing" query in the app.
 *
 * This wraps the SAME data (active slots only, public-readable) in
 * Next.js's built-in data cache, tagged per library. Cache lifetime is
 * capped at 5 minutes as a safety net even if a revalidateTag() call is
 * ever missed; in practice every write path below calls
 * revalidateSlotConfigsCache() immediately after a successful write, so
 * staleness in normal operation should be ~0, not 5 minutes.
 *
 * IMPORTANT: this uses createCacheSupabaseClient() (anon key, no cookies)
 * rather than a request-scoped client — see cache-client.ts for why. Only
 * call this for read paths that don't need the caller's session; the
 * underlying RLS policy (slot_configs_public_read_active) already permits
 * anonymous reads of active slots for active libraries, so this returns
 * exactly the same rows a logged-out visitor could already see directly.
 *
 * Cache key and tag both include libraryId so a write to one library's
 * slots never invalidates or collides with any other library's cache.
 */
export async function fetchActiveSlotConfigsCached(libraryId: string): Promise<SlotConfig[]> {
  const cached = unstable_cache(
    async (libId: string): Promise<SlotConfig[]> => {
      const supabase = createCacheSupabaseClient()
      return fetchActiveSlotConfigs(supabase, libId)
    },
    [`active-slot-configs-${libraryId}`],
    { revalidate: 300, tags: [`slot-configs-${libraryId}`] },
  )
  return cached(libraryId)
}

/**
 * Call this after any successful write to a library's slot_configs
 * (upsert, toggle, delete) so the cached read above doesn't serve stale
 * data until the 5-minute safety-net expiry. Safe to call even if nothing
 * is currently cached for this library — revalidateTag on a miss is a no-op.
 */
export function revalidateSlotConfigsCache(libraryId: string): void {
  revalidateTag(`slot-configs-${libraryId}`)
}

/**
 * Returns true iff the library has at least one active slot config.
 * Used by publishLibrary() — a library cannot go live with zero slots,
 * since slot_configs is now the only source of operating hours and pricing
 * (a library with zero active slots is permanently "closed" and unbookable).
 */
export async function hasActiveSlot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('slot_configs')
    .select('id', { count: 'exact', head: true })
    .eq('library_id', libraryId)
    .eq('is_active', true)

  if (error) {
    logError('hasActiveSlot', `library=${libraryId}`, error)
    return false
  }
  return (count ?? 0) > 0
}

/* ─── Write ───────────────────────────────────────────────────────────────── */

/**
 * Create or update a slot config. Runs full validation (shape + duplicate /
 * overlap detection against the library's other active slots) before
 * touching the database.
 */
export async function upsertSlotConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
  input:     SlotConfigInput,
  createdBy: string,
): Promise<ServiceResult<SlotConfig>> {
  const existing = await fetchSlotConfigs(supabase, libraryId)

  const validation = validateSlot(input, existing)
  if (validation.ok === false) return { success: false, error: validation.error }

  const payload = {
    library_id: libraryId,
    start_time: `${input.start}:00`,
    end_time:   `${input.end}:00`,
    days:       input.days,
    price:      input.price,
    discount:   input.discount,
    is_active:  input.is_active,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    // Existing bookings must always keep the pricing and timing they were
    // created with. If this slot still has any active (held/confirmed/
    // checked_in, not-yet-ended) booking scheduled inside its current
    // window, block changes to the fields that would retroactively affect
    // how that booking is understood — price, start time, or end time.
    // Days-of-week and discount/is_active changes are unaffected (a
    // booking's own start_time/end_time already fully fixes its own price
    // and window, independent of this check — this guard exists so the
    // *displayed* slot definition an owner is editing can't drift out from
    // under bookings that are actively relying on it).
    const current = existing.find(s => s.id === input.id)
    const pricingOrTimingChanged =
      !!current && (
        current.price !== input.price ||
        current.start !== input.start ||
        current.end   !== input.end
      )

    if (pricingOrTimingChanged) {
      const { data: hasActive, error: activeCheckErr } = await supabase
        .rpc('slot_has_active_bookings', { p_slot_id: input.id })

      if (activeCheckErr) {
        logError('upsertSlotConfig', `active-booking check library=${libraryId} slot=${input.id}`, activeCheckErr)
        return { success: false, error: 'Could not verify active bookings for this slot. Please try again.' }
      }
      if (hasActive) {
        return {
          success: false,
          error: 'This slot has active bookings scheduled against it, so its price, start time, or end time cannot be changed. Existing bookings keep the pricing and timing they were created with — create a new slot for future bookings instead.',
        }
      }
    }

    const { data, error } = await supabase
      .from('slot_configs')
      .update(payload as never)
      .eq('id', input.id)
      .eq('library_id', libraryId)
      .select('id, library_id, start_time, end_time, days, price, discount, is_active')
      .single()

    if (error || !data) {
      logError('upsertSlotConfig', `update library=${libraryId} slot=${input.id}`, error)
      return { success: false, error: error?.message ?? 'Failed to update slot' }
    }
    return { success: true, data: rowToSlot(data) }
  }

  const { data, error } = await supabase
    .from('slot_configs')
    .insert({ ...payload, created_by: createdBy } as never)
    .select('id, library_id, start_time, end_time, days, price, discount, is_active')
    .single()

  if (error || !data) {
    logError('upsertSlotConfig', `insert library=${libraryId}`, error)
    return { success: false, error: error?.message ?? 'Failed to create slot' }
  }
  return { success: true, data: rowToSlot(data) }
}

/**
 * Enable/disable a slot. Re-activating a slot re-runs conflict detection —
 * a slot that was disabled to avoid a conflict shouldn't silently become
 * ambiguous again when re-enabled.
 */
export async function toggleSlotConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
  slotId:    string,
  isActive:  boolean,
): Promise<ServiceResult<SlotConfig>> {
  const existing = await fetchSlotConfigs(supabase, libraryId)
  const slot     = existing.find(s => s.id === slotId)
  if (!slot) return { success: false, error: 'Slot not found' }

  if (isActive) {
    const conflict = findSlotConflict({ ...slot, is_active: true }, existing)
    if (conflict.ok === false) return { success: false, error: conflict.error }
  }

  const { data, error } = await supabase
    .from('slot_configs')
    .update({ is_active: isActive, updated_at: new Date().toISOString() } as never)
    .eq('id', slotId)
    .eq('library_id', libraryId)
    .select('id, library_id, start_time, end_time, days, price, discount, is_active')
    .single()

  if (error || !data) {
    logError('toggleSlotConfig', `library=${libraryId} slot=${slotId}`, error)
    return { success: false, error: error?.message ?? 'Failed to update slot' }
  }
  return { success: true, data: rowToSlot(data) }
}

/**
 * Permanently remove a slot config (not currently exposed in the UI, but
 * available for future use).
 *
 * NOTE: if you wire this up to an action, call
 * revalidateSlotConfigsCache(libraryId) after a successful delete, the same
 * way upsertSlotConfig/toggleSlotConfig's callers in owner.ts do — otherwise
 * the cached read path (fetchActiveSlotConfigsCached) will keep serving the
 * deleted slot for up to 5 minutes.
 */
export async function deleteSlotConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  libraryId: string,
  slotId:    string,
): Promise<ServiceResult<undefined>> {
  const { error } = await supabase
    .from('slot_configs')
    .delete()
    .eq('id', slotId)
    .eq('library_id', libraryId)

  if (error) {
    logError('deleteSlotConfig', `library=${libraryId} slot=${slotId}`, error)
    return { success: false, error: error.message }
  }
  return { success: true, data: undefined }
}