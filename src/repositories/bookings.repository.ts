// src/repositories/bookings.repository.ts
/**
 * Pure data-access layer for the `bookings` table (Phase 6 / Priority 3
 * rollout, following the seats and libraries repository pilots).
 *
 * Scope note: `bookings` is queried far more than this file covers — over
 * 50 call sites across dashboard stats, student booking history, seat
 * availability, admin refunds, and the webhook/cron jobs, each with a
 * genuinely different select shape for a genuinely different purpose.
 * Forcing all of those into one file would just relocate one-off queries,
 * not remove duplication — same reasoning as the seats/libraries
 * repositories. This file only covers the ONE write operation confirmed to
 * repeat verbatim across multiple files: a bare status update by booking
 * id, used for both check-in and cancellation.
 *
 *   - setBookingStatus  — 4 call sites:
 *       staff.ts (staffCheckIn), owner/dashboard.ts (checkInBooking),
 *       owner/seats.ts (forceFreeSeat), staff-seat-actions.ts (seniorForceFree)
 *
 * The overlap-check SELECT used by extendBooking/manual-booking flows was
 * evaluated too, but its three occurrences select different columns for
 * different purposes (id vs id+start_time+end_time) and aren't exact
 * duplicates — left as-is rather than force-generalized into a lowest-
 * common-denominator function that would obscure what each call site
 * actually needs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type TypedSupabaseClient = SupabaseClient<Database>
type BookingStatus = Database['public']['Enums']['booking_status']

export async function setBookingStatus(
  supabase: TypedSupabaseClient,
  bookingId: string,
  status: BookingStatus,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('bookings').update({ status: status as never }).eq('id', bookingId)
  return { error: error ? { message: error.message } : null }
}
