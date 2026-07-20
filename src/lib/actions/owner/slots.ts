'use server'

// src/lib/actions/owner/slots.ts
// Split from owner.ts (Phase 4 / Priority 2.1) — slot config CRUD.
// SlotConfig / SlotConfigInput types and validation live in lib/booking/*
// — this file only adds the owner-specific ownership check before
// delegating to the shared service.

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log } from '@/lib/logger'
import {
  fetchSlotConfigs,
  upsertSlotConfig as upsertSlotConfigDb,
  toggleSlotConfig as toggleSlotConfigDb,
  revalidateSlotConfigsCache,
} from '@/lib/booking/slotConfigService'
import type { SlotConfig, SlotConfigInput } from '@/lib/booking/types'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'

// Re-exported for backward compatibility — components import SlotConfig from
// '@/lib/actions/owner'. The type now lives in '@/lib/booking/types'.
export type { SlotConfig, SlotConfigInput }

/* ═══════════════════════════════════════════════════════════════════════════
   SLOT CONFIG
   ─────────────────────────────────────────────────────────────────────────
   Slots live in the `slot_configs` table (see supabase/migrations).
   SlotConfig / SlotConfigInput types and all validation live in
   lib/booking/* — this file only adds the owner-specific ownership check
   before delegating to the shared service.
═══════════════════════════════════════════════════════════════════════════ */

/** Verifies the current user owns `libraryId`. Returns null if not. */
async function verifyLibraryOwner(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  libraryId: string,
  userId: string,
): Promise<true | null> {
  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== userId) return null
  return true
}

export async function getSlotConfigs(libraryId: string): Promise<SlotConfig[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []
  if (!(await verifyLibraryOwner(supabase, libraryId, user.id))) return []
  return fetchSlotConfigs(supabase, libraryId)
}

export async function upsertSlotConfig(
  libraryId: string,
  slot: SlotConfigInput,
): Promise<ActionResult<SlotConfig>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  if (!(await verifyLibraryOwner(supabase, libraryId, user.id)))
    return { success: false, error: 'Access denied' }

  const result = await upsertSlotConfigDb(supabase, libraryId, slot, user.id)
  if (result.success === false) return result

  log('upsertSlotConfig', `library=${libraryId} slot=${result.data.id}`)
  revalidateSlotConfigsCache(libraryId)
  revalidatePath('/dashboard/slot-config')
  revalidatePath('/dashboard/bookings')
  return result
}

export async function toggleSlotConfig(
  libraryId: string,
  slotId:    string,
  is_active: boolean,
): Promise<ActionResult<SlotConfig>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  if (!(await verifyLibraryOwner(supabase, libraryId, user.id)))
    return { success: false, error: 'Access denied' }

  const result = await toggleSlotConfigDb(supabase, libraryId, slotId, is_active)
  if (result.success === false) return result

  log('toggleSlotConfig', `library=${libraryId} slot=${slotId} is_active=${is_active}`)
  revalidateSlotConfigsCache(libraryId)
  revalidatePath('/dashboard/slot-config')
  revalidatePath('/dashboard/bookings')
  return result
}

