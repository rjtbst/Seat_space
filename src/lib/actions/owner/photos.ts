'use server'

// src/lib/actions/owner/photos.ts
// Split from owner.ts (Phase 4 / Priority 2.1) — library photo CRUD.

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log, logError } from '@/lib/logger'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'

/* ═══════════════════════════════════════════════════════════════════════════
   LIBRARY EDIT — PHOTOS
═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   LIBRARY EDIT — PHOTOS
═══════════════════════════════════════════════════════════════════════════ */

/** Returns all photos for a library */
export async function getLibraryPhotos(
  libraryId: string,
): Promise<{ id: string; image_url: string; is_cover: boolean }[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('library_images')
    .select('id, image_url, is_cover')
    .eq('library_id', libraryId)
    .eq('deleted', false)
    .order('is_cover', { ascending: false })  // covers first
    .order('created_at', { ascending: true })

  if (error) { logError('getLibraryPhotos', 'Query failed', error); return [] }
  return (data ?? []).map(r => ({
    id:        r.id,
    image_url: r.image_url ?? '',
    is_cover:  r.is_cover ?? false,
  }))
}

/**
 * Uploads a new photo and stores it.
 *
 * NOTE: This action receives base64 data from the client and uploads to
 * Supabase Storage bucket "library-images". Make sure that bucket exists
 * and the service-role key has write access.
 *
 * Bucket name: "library-images"  (create via Supabase dashboard if needed)
 * Path pattern: `{libraryId}/{timestamp}-{random}.{ext}`
 */
export async function addLibraryPhoto(
  libraryId: string,
  base64Data: string,
  mimeType:   string,
  isCover:    boolean,
): Promise<ActionResult<{ photoId: string; imageUrl: string }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  // Convert base64 → Uint8Array
  const binaryStr = atob(base64Data)
  const bytes     = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  const ext      = mimeType.split('/')[1] ?? 'jpg'
  const fileName = `${libraryId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const BUCKET   = 'library-images'

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, bytes, { contentType: mimeType, upsert: false })

  if (uploadErr) { logError('addLibraryPhoto', 'Upload failed', uploadErr); return { success: false, error: uploadErr.message } }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)
  const imageUrl = urlData.publicUrl

  // If this is a cover, unset the old cover
  if (isCover) {
    await supabase
      .from('library_images')
      .update({ is_cover: false })
      .eq('library_id', libraryId)
      .eq('is_cover', true)
  }

  const { data: photo, error: dbErr } = await supabase
    .from('library_images')
    .insert({ library_id: libraryId, image_url: imageUrl, is_cover: isCover, deleted: false })
    .select('id')
    .single()

  if (dbErr || !photo) {
    logError('addLibraryPhoto', 'DB insert failed', dbErr)
    return { success: false, error: dbErr?.message ?? 'Failed to save photo record' }
  }

  log('addLibraryPhoto', `library=${libraryId} photo=${photo.id} cover=${isCover}`)
  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: { photoId: photo.id, imageUrl } }
}

/** Sets an existing photo as the cover (unsets all others first) */
export async function updateLibraryCover(
  libraryId: string,
  photoId:   string,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  // Verify photo belongs to this library
  const { data: photo } = await supabase
    .from('library_images').select('library_id').eq('id', photoId).maybeSingle()
  if ((photo as any)?.library_id !== libraryId) return { success: false, error: 'Photo not found in this library' }

  // Unset all covers first, then set this one
  const { error: unsetErr } = await supabase
    .from('library_images')
    .update({ is_cover: false })
    .eq('library_id', libraryId)
  if (unsetErr) { logError('updateLibraryCover', 'Unset failed', unsetErr); return { success: false, error: unsetErr.message } }

  const { error: setErr } = await supabase
    .from('library_images')
    .update({ is_cover: true })
    .eq('id', photoId)
  if (setErr) { logError('updateLibraryCover', 'Set failed', setErr); return { success: false, error: setErr.message } }

  log('updateLibraryCover', `library=${libraryId} photo=${photoId}`)
  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}

/** Soft-deletes a library photo */
export async function deleteLibraryPhoto(
  libraryId: string,
  photoId:   string,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const { data: photo } = await supabase
    .from('library_images').select('library_id, is_cover').eq('id', photoId).maybeSingle()
  if ((photo as any)?.library_id !== libraryId) return { success: false, error: 'Photo not found in this library' }

  // Soft-delete
  const { error } = await supabase
    .from('library_images').update({ deleted: true, is_cover: false }).eq('id', photoId)

  if (error) { logError('deleteLibraryPhoto', 'Delete failed', error); return { success: false, error: error.message } }

  log('deleteLibraryPhoto', `library=${libraryId} photo=${photoId}`)
  revalidatePath('/dashboard/my-libraries')
  return { success: true, data: undefined }
}
