// src/lib/booking/subscriptionScan.ts
/**
 * Shared subscription-QR scanning mechanics — the digital-pass equivalent
 * of lib/booking/qr.ts's booking QR flow, but for a subscription's whole
 * duration rather than a single booking. Used by BOTH the owner scanner
 * (lib/actions/owner/subscription-attendance.ts) and the staff scanner
 * (lib/actions/staff.ts), same "extract shared mechanics, keep the
 * caller-specific auth check in the caller" pattern already used for
 * lookupBookingForScan / lookupBookingForOwnerScan.
 *
 * The actual entitlement re-check (active status, correct library, valid
 * date/time/day) happens INSIDE record_subscription_scan() at the database
 * level — this file's job is just presenting a preview before the scan is
 * confirmed, and calling that RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { ActionResult } from '@/lib/actions/shared/action-result'

export type SubscriptionScanPreview = {
  id:              string
  studentName:     string
  planName:        string
  libraryId:       string
  libraryName:     string
  seatLabel:       string
  status:          string
  startDate:       string
  endDate:         string
  timeWindowStart: string | null
  timeWindowEnd:   string | null
  daysOfWeek:      number[] | null
}

/**
 * Look up a subscription by id for the scan-preview screen. Does NOT do
 * any authorization — callers (owner vs staff wrappers) each apply their
 * own "is this my library" check against the returned `libraryId`/
 * `ownerId`, same split as lookupBookingForScan vs lookupBookingForOwnerScan.
 * The RPC below re-checks authorization authoritatively regardless.
 */
export async function fetchSubscriptionScanPreview(
  supabase: SupabaseClient<Database>,
  subscriptionId: string,
): Promise<{ preview: SubscriptionScanPreview; ownerId: string | null } | null> {
  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select(`
      id, status, start_date, end_date, library_id, seat_id, user_id,
      plans(name, time_window_start, time_window_end, days_of_week),
      libraries(name, owner_id),
      seats(row_label, column_number),
      users(full_name)
    `)
    .eq('id', subscriptionId)
    .maybeSingle()

  if (error || !sub) return null
  const s = sub as any

  return {
    ownerId: s.libraries?.owner_id ?? null,
    preview: {
      id:              s.id,
      studentName:     s.users?.full_name ?? 'Student',
      planName:        s.plans?.name ?? 'Membership plan',
      libraryId:       s.library_id,
      libraryName:     s.libraries?.name ?? '',
      seatLabel:       s.seats ? `${s.seats.row_label}${s.seats.column_number}` : '—',
      status:          s.status,
      startDate:       s.start_date,
      endDate:         s.end_date,
      timeWindowStart: s.plans?.time_window_start ?? null,
      timeWindowEnd:   s.plans?.time_window_end ?? null,
      daysOfWeek:      s.plans?.days_of_week ?? null,
    },
  }
}

const SCAN_ERROR_MESSAGES: Record<string, string> = {
  not_authorized:          'You are not authorized to scan for this library',
  subscription_not_found:  'Subscription not found',
  subscription_not_active: 'This subscription is not active',
  wrong_library:            'This pass belongs to a different library',
  invalid_date:             'This subscription is not valid today (outside its start/end date)',
  invalid_time:             'Outside this plan\'s allowed hours',
  invalid_day:              'Not valid today — outside this plan\'s allowed days',
}

/**
 * Confirms the scan — records a check-in, or a check-out if the student
 * already has an open (checked-in, not checked-out) visit today. Calls
 * record_subscription_scan(), the single source of truth for the
 * active/library/date/time/day validation described in the spec.
 */
export async function recordSubscriptionScan(
  supabase: SupabaseClient<Database>,
  subscriptionId: string,
  scanningLibraryId: string,
  actorId: string,
): Promise<ActionResult<{ action: 'checked_in' | 'checked_out' }>> {
  const { data, error } = await (supabase as any).rpc('record_subscription_scan', {
    p_subscription_id:     subscriptionId,
    p_scanning_library_id: scanningLibraryId,
    p_actor_id:            actorId,
  })

  if (error) return { success: false, error: error.message ?? 'Scan failed' }
  if (!data?.success) return { success: false, error: SCAN_ERROR_MESSAGES[data?.error] ?? 'Scan failed' }

  return { success: true, data: { action: data.action } }
}
