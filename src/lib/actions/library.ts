'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireActionRole } from '@/lib/auth/guards'
import { z } from 'zod'
import type { ActionResult } from '@/lib/actions/auth'
import { countSeats } from '@/repositories/seats.repository'
import { isLibraryOwnedBy } from '@/repositories/libraries.repository'

/* ─── Shared Zod schema ─────────────────────────────────────────────────────── */
const librarySchema = z.object({
  name:                z.string().min(2).max(120).trim(),
  state:               z.string().min(1).max(80).trim(),
  description:      z.string().max(400).trim().optional(),
  city:                z.string().min(1).max(80).trim(),
  area:                z.string().min(1).max(120).trim(),
  address:             z.string().min(5).max(400).trim(),
  amenity_ids:         z.array(z.string().uuid()).min(1),
  latitude:            z.number().nullable().optional(),
  longitude:           z.number().nullable().optional(),
})

export type LibraryFormInput = z.infer<typeof librarySchema>

/* ═══════════════════════════════════════════════════════════════
   GET LIBRARY FOR EDIT
═══════════════════════════════════════════════════════════════ */
export type LibraryForEdit = {
  id:                  string
  name:                string
  state:               string
  city:                string
  area:                string
  address:             string
  description:         string
  amenityIds:          string[]      // UUIDs
  latitude:            number | null
  longitude:           number | null
  approvalStatus:      string
}

export async function getLibraryForEdit(
  libraryId: string,
): Promise<LibraryForEdit | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: lib } = await supabase
    .from('libraries')
    .select('id, name, state, city, area, address, latitude, longitude, approval_status')
    .eq('id', libraryId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!lib) return null

  // Fetch linked amenity IDs directly — no join needed
  const { data: linkedAmenities } = await supabase
    .from('library_amenities')
    .select('amenity_id')
    .eq('library_id', libraryId)

  const amenityIds: string[] = (linkedAmenities ?? []).map((r: any) => r.amenity_id)

  // Active seat count
  const seatCount = await countSeats(supabase, libraryId, { activeOnly: true })

  const fmt = (t: string | null) => (t ? String(t).slice(0, 5) : '')

  return {
    id:                  lib.id,
    name:                lib.name                ?? '',
    state:               (lib as any).state      ?? '',
    description:         (lib as any).description ?? '',
    city:                lib.city                ?? '',
    area:                lib.area                ?? '',
    address:             lib.address             ?? '',
    amenityIds,
    latitude:            lib.latitude   != null ? Number(lib.latitude)   : null,
    longitude:           lib.longitude  != null ? Number(lib.longitude)  : null,
    approvalStatus:      (lib as any).approval_status ?? 'pending',
  }
}

/* ═══════════════════════════════════════════════════════════════
   CREATE LIBRARY
═══════════════════════════════════════════════════════════════ */
export async function createLibrary(
  input: LibraryFormInput,
): Promise<ActionResult<{ libraryId: string; trialEndsAt: string | null }>> {
  const parsed = librarySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const gate = await requireActionRole('owner')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const {
    name, state, city, area, address, description, amenity_ids,
    latitude, longitude,
  } = parsed.data

  // 14-day free trial, ONLY for the very first library an owner ever
  // creates -- a second library (from this owner or after this one is
  // deleted/deactivated) always needs an active paid subscription before
  // it can go live. Checked by count, not by any "has ever had a trial"
  // flag, so it can't accidentally re-trigger if this insert is ever
  // retried after a partial failure below.
  const { count: existingLibraryCount } = await supabase
    .from('libraries')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id)

  const isFirstLibrary = (existingLibraryCount ?? 0) === 0
  const trialEndsAt = isFirstLibrary
    ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data: library, error: libErr } = await supabase
    .from('libraries')
    .insert({
      owner_id:            user.id,
      name,
      state:               state || null,
      city,
      area,
      address,
      description,
      latitude:            latitude            ?? null,
      longitude:           longitude           ?? null,
      is_active:           false,
      trial_ends_at:       trialEndsAt,
    } as any)
    .select('id')
    .single()

  if (libErr || !library) {
    console.error('createLibrary error:', libErr)
    return { success: false, error: libErr?.message ?? 'Failed to create library' }
  }

  const libraryId = library.id

  await syncAmenities(supabase, libraryId, amenity_ids)

  return { success: true, data: { libraryId, trialEndsAt } }
}

/* ═══════════════════════════════════════════════════════════════
   UPDATE LIBRARY
═══════════════════════════════════════════════════════════════ */
export async function updateLibrary(
  libraryId: string,
  input: LibraryFormInput,
): Promise<ActionResult<{ libraryId: string }>> {
  const parsed = librarySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const owned = await isLibraryOwnedBy(supabase, libraryId, user.id)
  if (!owned) return { success: false, error: 'Library not found or access denied' }

  const {
    name, state, city, area, address,

    amenity_ids, latitude, longitude,
  } = parsed.data

  const { error: updateErr } = await supabase
    .from('libraries')
    .update({
      name,
      state:               state || null,
      city,
      area,
      address,

      latitude:            latitude            ?? null,
      longitude:           longitude           ?? null,
    } as any)
    .eq('id', libraryId)
    .eq('owner_id', user.id)

  if (updateErr) {
    console.error('updateLibrary error:', updateErr)
    return { success: false, error: updateErr.message }
  }

  await syncAmenities(supabase, libraryId, amenity_ids)

  return { success: true, data: { libraryId } }
}

/* ═══════════════════════════════════════════════════════════════
   PRIVATE HELPERS
═══════════════════════════════════════════════════════════════ */
async function syncAmenities(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  libraryId: string,
  amenityIds: string[],
) {
  const { error: deleteErr } = await supabase
    .from('library_amenities')
    .delete()
    .eq('library_id', libraryId)

  if (deleteErr) {
    console.error('syncAmenities: delete failed', deleteErr)
    return
  }

  if (!amenityIds.length) return

  const { error: linkErr } = await supabase
    .from('library_amenities')
    .insert(amenityIds.map(amenity_id => ({ library_id: libraryId, amenity_id })))

  if (linkErr) console.error('syncAmenities: insert failed', linkErr)
}



/* ═══════════════════════════════════════════════════════════════
   UPLOAD LIBRARY PHOTO
═══════════════════════════════════════════════════════════════ */
export async function uploadLibraryPhoto(
  formData: FormData,
): Promise<ActionResult<{ id: string; url: string; isCover: boolean }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const file      = formData.get('file')      as File   | null
  const libraryId = formData.get('libraryId') as string | null
  const isCover   = formData.get('isCover')   === '1'

  if (!file || !libraryId) return { success: false, error: 'Missing file or libraryId' }

  const owned = await isLibraryOwnedBy(supabase, libraryId, user.id)
  if (!owned) return { success: false, error: 'Library not found or access denied' }

  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) return { success: false, error: 'Only JPG, PNG, and WebP images are allowed' }
  if (file.size > 10 * 1024 * 1024) return { success: false, error: 'File size must be under 10 MB' }

  const ext         = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const prefix      = isCover ? 'cover' : 'photo'
  const rand        = Math.random().toString(36).slice(2)
  const storagePath = `${libraryId}/${prefix}-${Date.now()}-${rand}.${ext}`

  const { error: storageErr } = await supabase.storage
    .from('library-images')
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type, cacheControl: '3600', upsert: false,
    })

  if (storageErr) {
    console.error('uploadLibraryPhoto storage error:', storageErr)
    return { success: false, error: storageErr.message }
  }

  const { data: { publicUrl } } = supabase.storage.from('library-images').getPublicUrl(storagePath)

  const { count: existingCount } = await supabase
    .from('library_images').select('*', { count: 'exact', head: true }).eq('library_id', libraryId)

  const effectiveIsCover = isCover || (existingCount === 0)

  if (effectiveIsCover) {
    await supabase.from('library_images')
      .update({ is_cover: false }).eq('library_id', libraryId).eq('is_cover', true)
  }

  const { data: imgRow, error: insertErr } = await supabase
    .from('library_images')
    .insert({ library_id: libraryId, image_url: publicUrl, is_cover: effectiveIsCover })
    .select('id').single()

  if (insertErr || !imgRow) {
    await supabase.storage.from('library-images').remove([storagePath])
    return { success: false, error: insertErr?.message ?? 'Failed to save photo record' }
  }

  return { success: true, data: { id: imgRow.id, url: publicUrl, isCover: effectiveIsCover } }
}

/* ═══════════════════════════════════════════════════════════════
   GET LIBRARY PHOTOS
═══════════════════════════════════════════════════════════════ */
export type LibraryPhotoRow = { id: string; url: string; isCover: boolean }

export async function getLibraryPhotos(libraryId: string): Promise<LibraryPhotoRow[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const owned = await isLibraryOwnedBy(supabase, libraryId, user.id)
  if (!owned) return []

  const { data } = await supabase
    .from('library_images')
    .select('id, image_url, is_cover')
    .eq('library_id', libraryId)
    .order('is_cover', { ascending: false })
    .order('created_at', { ascending: true })

  return (data ?? [])
    .filter((r): r is typeof r & { image_url: string } => r.image_url !== null)
    .map(r => ({ id: r.id, url: r.image_url, isCover: r.is_cover ?? false }))
}

/* ═══════════════════════════════════════════════════════════════
   SET COVER PHOTO
═══════════════════════════════════════════════════════════════ */
export async function setCoverPhoto(imageId: string, libraryId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const owned = await isLibraryOwnedBy(supabase, libraryId, user.id)
  if (!owned) return { success: false, error: 'Library not found or access denied' }

  await supabase.from('library_images')
    .update({ is_cover: false }).eq('library_id', libraryId).eq('is_cover', true)

  const { error } = await supabase.from('library_images')
    .update({ is_cover: true }).eq('id', imageId).eq('library_id', libraryId)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════
   DELETE LIBRARY PHOTO
═══════════════════════════════════════════════════════════════ */
export async function deleteLibraryPhoto(imageId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: img } = await supabase
    .from('library_images')
    .select('id, image_url, is_cover, library_id, libraries(owner_id)')
    .eq('id', imageId).maybeSingle()

  if (!img) return { success: false, error: 'Photo not found' }

  const ownerRaw = img.libraries
  const ownerId  = Array.isArray(ownerRaw) ? ownerRaw[0]?.owner_id : (ownerRaw as any)?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  try {
    if (img.image_url) {
      const afterBucket = new URL(img.image_url).pathname.split('/library-images/')[1] ?? ''
      if (afterBucket) await supabase.storage.from('library-images').remove([afterBucket])
    }
  } catch {
    console.warn('deleteLibraryPhoto: could not parse image URL')
  }

  const { error: deleteErr } = await supabase.from('library_images').delete().eq('id', imageId)
  if (deleteErr) return { success: false, error: deleteErr.message }

  if (img.is_cover && img.library_id) {
    const { data: next } = await supabase
      .from('library_images').select('id')
      .eq('library_id', img.library_id)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (next) {
      await supabase.from('library_images').update({ is_cover: true }).eq('id', next.id)
    }
  }

  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════
   GET LIBRARY ONBOARDING SUMMARY
═══════════════════════════════════════════════════════════════ */
export type LibrarySummary = {
  name: string; city: string; area: string
  hasAddress: boolean; 
  photoCount: number; coverUrl: string | null
}

export async function getLibraryOnboardingSummary(libraryId: string): Promise<LibrarySummary | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: lib } = await supabase
    .from('libraries')
    .select('name, city, area, address')
    .eq('id', libraryId).eq('owner_id', user.id).maybeSingle()
  if (!lib) return null



  const { data: photos } = await supabase
    .from('library_images').select('image_url, is_cover')
    .eq('library_id', libraryId).order('is_cover', { ascending: false })

  const fmt = (t: string | null) => (t ? String(t).slice(0, 5) : '–')

  return {
    name:       lib.name      ?? '',
    city:       lib.city      ?? '',
    area:       lib.area      ?? '',
    hasAddress: !!(lib.address?.trim()),
    photoCount: photos?.length ?? 0,
    coverUrl:   photos?.find(p => p.is_cover)?.image_url ?? photos?.[0]?.image_url ?? null,
  }
}

/* ═══════════════════════════════════════════════════════════════
   PUBLISH LIBRARY
   ───────────────────────────────────────────────────────────────
   A library can only go fully live (is_active = true, publicly
   visible) when BOTH are true:
     1. approval_status = 'approved' (platform admin has reviewed it)
     2. it has an active platform subscription (₹399/mo, see
        lib/actions/platform-subscription.ts)
   This action is the owner-facing "go live" trigger. What it does
   depends on where the library currently stands:
     - Never submitted / rejected -> submit for admin review
       (approval_status -> 'pending', submitted_for_review_at set).
       is_active is NOT set yet — admin approval comes first.
     - Already approved previously (e.g. owner re-publishing after
       an edit, or resuming after fixing a lapsed subscription) ->
       just needs the subscription gate; flips is_active straight
       to true without going through review again.
     - Pending review already -> no-op, tell the owner it's still
       under review.
     - Suspended by admin -> owner cannot self-reactivate at all;
       must contact support / wait for admin to lift the suspension.
═══════════════════════════════════════════════════════════════ */
export async function publishLibrary(libraryId: string): Promise<ActionResult<{ status: 'submitted' | 'live' | 'already_pending' }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: lib } = await supabase
    .from('libraries')
    .select('id, approval_status, is_active')
    .eq('id', libraryId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!lib) return { success: false, error: 'Library not found or access denied' }

  const approvalStatus = (lib as any).approval_status as string

  if (approvalStatus === 'suspended') {
    return {
      success: false,
      error: 'This library has been suspended by the platform admin. Please contact support to resolve this before going live again.',
    }
  }

  const { count: photoCount } = await supabase
    .from('library_images').select('*', { count: 'exact', head: true }).eq('library_id', libraryId)
  if (!photoCount || photoCount === 0)
    return { success: false, error: 'Upload at least one photo before going live' }

  // Gate 2: active platform subscription required regardless of approval
  // state -- OR still within the one-time first-library trial window.
  // Calls the same has_active_platform_subscription() the DB activation
  // trigger and the public-visibility RLS policy already use, rather
  // than re-deriving "is this library allowed to be active" in JS a
  // second time and risking the two drifting apart.
  const { data: subActiveOrTrial } = await supabase.rpc('has_active_platform_subscription', { lib_id: libraryId })

  if (!subActiveOrTrial) {
    const { data: trialDays } = await supabase.rpc('trial_days_remaining', { lib_id: libraryId })
    const expiredTrialMsg = trialDays === 0
      ? 'Your 14-day free trial has ended. Set up a ₹399/month platform subscription to bring this library back online.'
      : 'This library needs an active ₹399/month platform subscription before it can go live. Set up your subscription first.'
    return { success: false, error: expiredTrialMsg }
  }

  if (approvalStatus === 'approved') {
    const { error } = await supabase
      .from('libraries').update({ is_active: true } as any).eq('id', libraryId).eq('owner_id', user.id)
    if (error) { console.error('publishLibrary error:', error); return { success: false, error: error.message } }
    return { success: true, data: { status: 'live' } }
  }

  if (approvalStatus === 'pending' && (lib as any).is_active === false) {
    // Could already be mid-review (submitted_for_review_at set) or never
    // submitted at all — either way, (re)submit so it surfaces/refreshes in
    // the admin queue, but don't error out if it's simply still pending.
  }

  const { error: submitErr } = await supabase
    .from('libraries')
    .update({
      approval_status: 'pending' as any,
      submitted_for_review_at: new Date().toISOString(),
    } as any)
    .eq('id', libraryId)
    .eq('owner_id', user.id)

  if (submitErr) {
    console.error('publishLibrary submit-for-review error:', submitErr)
    return { success: false, error: submitErr.message }
  }

  return { success: true, data: { status: 'submitted' } }
}

/* ═══════════════════════════════════════════════════════════════
   GET LIBRARY GO-LIVE STATUS
   Combined approval + subscription + listing snapshot for the
   owner-facing go-live page (GoLiveClient).
═══════════════════════════════════════════════════════════════ */
export type LibraryGoLiveStatus = {
  libraryId:            string
  approvalStatus:       'pending' | 'approved' | 'rejected' | 'suspended'
  approvalNotes:        string | null
  suspendedReason:      string | null
  isActive:             boolean
  isPubliclyVisible:    boolean
  subscriptionStatus:   string | null
  subscriptionActive:   boolean
  hasPhotos:            boolean
  isInTrial:            boolean
  trialDaysRemaining:   number | null // null = never had a trial (not this owner's first library)
  displayStatus:        LibraryDisplayStatus
}

import { computeLibraryDisplayStatus, type LibraryDisplayStatus } from '@/lib/library-status'

export async function getLibraryGoLiveStatus(libraryId: string): Promise<LibraryGoLiveStatus | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: lib } = await supabase
    .from('libraries')
    .select('id, approval_status, approval_notes, suspended_reason, is_active, trial_ends_at')
    .eq('id', libraryId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!lib) return null

  const { data: sub } = await supabase
    .from('platform_subscriptions')
    .select('status, grace_period_ends_at')
    .eq('library_id', libraryId)
    .maybeSingle()

  const { count: photoCount } = await supabase
    .from('library_images').select('*', { count: 'exact', head: true }).eq('library_id', libraryId)

  // Single source of truth for "is this library allowed to be active" --
  // same function the DB activation trigger and public RLS policy use,
  // so this page can never show "you need a subscription" while the
  // trigger would actually let the library go live (or vice versa).
  const { data: subActiveOrTrial } = await supabase.rpc('has_active_platform_subscription', { lib_id: libraryId })
  const { data: trialDaysRemaining } = await supabase.rpc('trial_days_remaining', { lib_id: libraryId })

  const trialEndsAt = (lib as any).trial_ends_at as string | null
  const isInTrial = trialEndsAt != null && new Date(trialEndsAt) > new Date()

  const subStatus = (sub as any)?.status ?? null
  // Kept for the payment-history / "which billing state" UI, distinct
  // from subActiveOrTrial above (which also counts a live trial as
  // "active" for go-live purposes -- this one reflects the REAL Razorpay
  // subscription status only).
  const subActive = subStatus === 'active' ||
    subStatus === 'authenticated' || // mandate authorized, first charge pending — treat as active for go-live purposes
    (subStatus === 'past_due' && (sub as any)?.grace_period_ends_at && new Date((sub as any).grace_period_ends_at) > new Date())

  const approvalStatus = ((lib as any).approval_status ?? 'pending') as LibraryGoLiveStatus['approvalStatus']

  return {
    libraryId:          lib.id,
    approvalStatus,
    approvalNotes:      (lib as any).approval_notes ?? null,
    suspendedReason:    (lib as any).suspended_reason ?? null,
    isActive:           !!(lib as any).is_active,
    isPubliclyVisible:  approvalStatus === 'approved' && !!(lib as any).is_active && !!subActiveOrTrial,
    subscriptionStatus: subStatus,
    subscriptionActive: subActive,
    hasPhotos:          (photoCount ?? 0) > 0,
    isInTrial,
    trialDaysRemaining: trialDaysRemaining ?? null,
    displayStatus:      computeLibraryDisplayStatus({
      approvalStatus,
      isActive: !!(lib as any).is_active,
      subscriptionStatus: subStatus,
      subscriptionActive: !!subActiveOrTrial,
      isInTrial,
      hadTrial: trialEndsAt != null,
    }),
  }
}