'use server'

// src/lib/actions/owner/subscription-attendance.ts
// Owner-side subscription QR scanning — the digital-pass equivalent of
// checkInBooking / lookupBookingForOwnerScan in owner/dashboard.ts.

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'
import {
  fetchSubscriptionScanPreview,
  recordSubscriptionScan,
  type SubscriptionScanPreview,
} from '@/lib/booking/subscriptionScan'
import type { ActionResult } from '@/lib/actions/shared/action-result'

export type { SubscriptionScanPreview }

export async function lookupSubscriptionForOwnerScan(
  subscriptionId: string,
): Promise<ActionResult<SubscriptionScanPreview>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const result = await fetchSubscriptionScanPreview(supabase, subscriptionId)
  if (!result) return { success: false, error: 'Subscription not found' }
  if (result.ownerId !== user.id) return { success: false, error: 'This pass belongs to a different library' }

  return { success: true, data: result.preview }
}

export async function ownerCheckInSubscription(
  subscriptionId: string,
  libraryId: string,
): Promise<ActionResult<{ action: 'checked_in' | 'checked_out' }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const result = await recordSubscriptionScan(supabase, subscriptionId, libraryId, user.id)
  if (result.success) {
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/subscribers')
    revalidatePath('/dashboard/scanner')
  }
  return result
}
