'use server'

// src/lib/actions/owner/library-settings.ts
// Split from owner.ts (Phase 4 / Priority 2.1) — library active toggle,
// info edit, and amenities.

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log, logError } from '@/lib/logger'
import { revalidateCitiesCache } from '@/lib/booking/citiesCache'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'

/* ═══════════════════════════════════════════════════════════════════════════
   TOGGLE LIBRARY ACTIVE
═══════════════════════════════════════════════════════════════════════════ */
export async function toggleLibraryActive(libraryId: string, is_active: boolean): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Turning OFF is always allowed — an owner can pause their own listing
  // any time (renovation, temporary closure, etc.) with no gate needed.
  // Turning ON must pass the exact same checks as the initial go-live flow
  // (see publishLibrary in library.ts) — this toggle used to bypass those
  // entirely, letting an owner reactivate a library with no admin approval
  // and/or no paid subscription. Kept in sync with publishLibrary's gate
  // logic; if that logic changes, update both.
  if (is_active) {
    const { data: lib } = await supabase
      .from('libraries')
      .select('approval_status')
      .eq('id', libraryId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!lib) return { success: false, error: 'Library not found or access denied' }

    const approvalStatus = (lib as any).approval_status as string

    if (approvalStatus === 'suspended')
      return { success: false, error: 'This library has been suspended by the platform admin. Please contact support to resolve this before reactivating.' }

    if (approvalStatus !== 'approved')
      return { success: false, error: 'This library is still awaiting admin approval and cannot be activated yet.' }

    // Same single source of truth as publishLibrary() in lib/actions/
    // library.ts -- now also respects the first-library trial window
    // automatically, since both just call has_active_platform_subscription()
    // rather than re-deriving active/grace logic in JS a second time.
    const { data: subActiveOrTrial } = await supabase.rpc('has_active_platform_subscription', { lib_id: libraryId })

    if (!subActiveOrTrial)
      return { success: false, error: 'This library needs an active ₹399/month platform subscription (or an unexpired free trial) before it can be activated. Please complete payment first.' }
  }

  const { error } = await supabase
    .from('libraries').update({ is_active }).eq('id', libraryId).eq('owner_id', user.id)

  if (error) { logError('toggleLibraryActive', 'Update failed', error); return { success: false, error: error.message } }

  log('toggleLibraryActive', `library=${libraryId} is_active=${is_active}`)
  revalidateCitiesCache()
  revalidatePath('/dashboard/my-libraries')
  revalidatePath('/dashboard')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIBRARY EDIT — INFO
   ─────────────────────────────────────────────────────────────────────────
   Append this entire block to the bottom of src/lib/actions/owner.ts
═══════════════════════════════════════════════════════════════════════════ */

export async function updateLibraryInfo(
  libraryId: string,
  patch: { name: string; city: string; area: string },
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Verify ownership
  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const { error } = await supabase
    .from('libraries')
    .update({ name: patch.name, city: patch.city, area: patch.area })
    .eq('id', libraryId)

  if (error) { logError('updateLibraryInfo', 'Update failed', error); return { success: false, error: error.message } }

  log('updateLibraryInfo', `library=${libraryId} name=${patch.name}`)
  revalidateCitiesCache()
  revalidatePath('/dashboard/my-libraries')
  revalidatePath('/dashboard')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIBRARY EDIT — AMENITIES
═══════════════════════════════════════════════════════════════════════════ */

/** Returns all amenities in the system + which ones are selected for this library */
export async function getAmenities(
  libraryId: string,
): Promise<{ all: { id: string; name: string }[]; selected: string[] }> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { all: [], selected: [] }

  const [allRes, selectedRes] = await Promise.all([
    supabase.from('amenities').select('id, name').order('name'),
    supabase.from('library_amenities').select('amenity_id').eq('library_id', libraryId),
  ])

  return {
    all:      (allRes.data ?? []).map(a => ({ id: a.id, name: a.name ?? '' })),
    selected: (selectedRes.data ?? []).map(r => r.amenity_id),
  }
}

/** Replaces the full set of amenities for a library (diff + upsert/delete) */
export async function updateLibraryAmenities(
  libraryId:    string,
  amenityIds:   string[],
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  // Fetch current links
  const { data: current } = await supabase
    .from('library_amenities').select('amenity_id').eq('library_id', libraryId)

  const currentIds = new Set((current ?? []).map(r => r.amenity_id))
  const nextIds    = new Set(amenityIds)

  const toAdd    = amenityIds.filter(id => !currentIds.has(id))
  const toRemove = [...currentIds].filter(id => !nextIds.has(id))

  if (toAdd.length) {
    const { error } = await supabase
      .from('library_amenities')
      .insert(toAdd.map(amenity_id => ({ library_id: libraryId, amenity_id })))
    if (error) {
      logError('updateLibraryAmenities', 'Insert failed', error)
      return { success: false, error: error.message }
    }
  }

  if (toRemove.length) {
    const { error } = await supabase
      .from('library_amenities')
      .delete()
      .eq('library_id', libraryId)
      .in('amenity_id', toRemove)
    if (error) {
      logError('updateLibraryAmenities', 'Delete failed', error)
      return { success: false, error: error.message }
    }
  }

  log('updateLibraryAmenities', `library=${libraryId} added=${toAdd.length} removed=${toRemove.length}`)
  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}
