'use server'

/**
 * staff-seat-actions.ts
 * ─────────────────────
 * APPEND these exports to your existing staff.ts file.
 *
 * Adds:
 *  • getStaffLibrarySlots   — any assigned staff can fetch this library's slot config
 *  • seniorToggleSeatActive — senior_staff only: activate / deactivate a seat
 *  • seniorAddSeatRow       — senior_staff only: add a new seat row
 *  • seniorManualBook       — senior_staff only: manual walk-in booking (same shape as owner's)
 *  • seniorForceFree        — senior_staff only: cancel active booking & free the seat
 *  • getSeniorSeatLayout    — senior_staff only: seat layout with live status (same shape as owner's)
 *
 * All mutation actions validate the caller is senior_staff for the given library
 * via the staff table — no owner_id check is needed.
 */

import { revalidatePath }           from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionResult }         from '@/lib/actions/auth'
import { nowIST }                    from '@/lib/ist'
import { log, logError }             from '@/lib/logger'
import { fetchActiveSlotConfigs }    from '@/lib/booking/slotConfigService'
import type { SlotConfig }           from '@/lib/booking/types'
import { createManualBooking }       from '@/services/booking/createManualBooking'
import {
  listSeatLayout,
  getSeatById,
  setSeatActive,
  rowLabelExists,
  insertSeats,
} from '@/repositories/seats.repository'
import { setBookingStatus } from '@/repositories/bookings.repository'

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED TYPES  (mirrors owner.ts so StaffSeatManagerClient needs one import)
═══════════════════════════════════════════════════════════════════════════ */

// Re-exported for backward compatibility — StaffBookingsClient imports
// SlotConfig from '@/lib/actions/staff-seat-actions'. The type now lives in
// '@/lib/booking/types' and slots come from the slot_configs table.
export type { SlotConfig }

/** Mirrors ActiveBooking from owner.ts */
export type SeniorActiveBooking = {
  id:           string
  guest_name:   string | null
  guest_phone:  string | null
  start_time:   string   // plain IST
  end_time:     string   // plain IST
  booking_mode: 'online' | 'offline'
  status:       string
}

/** Mirrors SeatRow from owner.ts — used by StaffSeatManagerClient */
export type SeniorSeatRow = {
  id:               string
  row_label:        string
  column_number:    number
  is_active:        boolean
  live_status:      'free' | 'booked' | 'held' | 'inactive'
  current_booking?: SeniorActiveBooking
}

/** Input for senior staff manual booking — mirrors ManualBookInput from owner.ts */
export type SeniorManualBookInput = {
  seatId:      string
  libraryId:   string
  userName:    string
  userPhone:   string
  startTime:   string   // plain IST "YYYY-MM-DDTHH:mm:ss"
  endTime:     string   // plain IST "YYYY-MM-DDTHH:mm:ss"
  bookingMode: 'online' | 'offline'
  amountPaid:  number
  paymentMode: 'cash' | 'upi' | 'other'
  paymentNote: string
}

/* ═══════════════════════════════════════════════════════════════════════════
   INTERNAL HELPER
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Verify the current user is senior_staff for this library.
 * Returns the staff row on success, null on failure.
 *
 * This is the single gate used by every senior-staff mutation below.
 */
async function assertSeniorStaff(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId:    string,
  libraryId: string,
) {
  const { data, error } = await supabase
    .from('staff')
    .select('id, role')
    .eq('user_id', userId)   // ← will be replaced; see actual calls below
    .eq('library_id', libraryId)
    .maybeSingle()

  if (error || !data || data.role !== 'senior_staff') return null
  return data
}

// NOTE: the helper above won't compile as-is because `user_id` is a free
// variable placeholder. Each action passes the authenticated user.id explicitly.
// The real guard is inlined in each function for clarity — see below.

/* ═══════════════════════════════════════════════════════════════════════════
   SLOT CONFIG (read-only, any assigned staff)
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch active slot configs for a library.
 * Any staff member assigned to the library may call this.
 * Used to build dynamic slot-filter tabs in StaffBookingsClient.
 *
 * Falls back to an empty array if no slots are configured — the client
 * then shows only the "All" tab.
 */
export async function getStaffLibrarySlots(libraryId: string): Promise<SlotConfig[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Verify caller is assigned to this library (any role)
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!staffRow) return []   // not assigned → no slot data

  return fetchActiveSlotConfigs(supabase, libraryId)
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEAT LAYOUT  (senior_staff read)
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Returns the live seat layout for a library.
 * Mirrors owner's getSeatLayout — senior_staff may call this.
 * The caller must be senior_staff; regular staff use getStaffSeatLayout.
 */
export async function getSeniorSeatLayout(libraryId: string): Promise<SeniorSeatRow[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Role check — senior_staff only
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!staffRow || staffRow.role !== 'senior_staff') return []

  const now = nowIST()

  const [seatData, bookingsRes] = await Promise.all([
    listSeatLayout(supabase, libraryId),

    supabase
      .from('bookings')
      .select(`
        id, seat_id, status, booking_mode,
        start_time, end_time, hold_expires_at,
        guest_name, guest_phone, user_id,
        users(full_name, phone)
      `)
      .eq('library_id', libraryId)
      .lte('start_time', now)
      .gte('end_time', now)
      .in('status', ['confirmed', 'checked_in', 'held'] as never[]),
  ])

  if (!seatData.length) return []

  const nowMs = new Date(now).getTime()

  const bookingBySeat = new Map<string, any>()
  for (const b of bookingsRes.data ?? []) {
    // Option B: expired holds are treated as free at query-result level.
    // The DB EXCLUDE constraint still prevents double-booking at write time.
    if (b.status === 'held' && b.hold_expires_at) {
      const expiresMs = new Date(b.hold_expires_at).getTime()
      if (expiresMs < nowMs) continue   // skip — treat as free
    }
    if (!b.seat_id) continue
    if (!bookingBySeat.has(b.seat_id)) bookingBySeat.set(b.seat_id, b)
  }

  return seatData.map((s) => {
    const b = bookingBySeat.get(s.id)

    const live_status: SeniorSeatRow['live_status'] = !s.is_active
      ? 'inactive'
      : !b
        ? 'free'
        : ['confirmed', 'checked_in'].includes(b.status)
          ? 'booked'
          : 'held'

    const current_booking: SeniorActiveBooking | undefined = b
      ? {
          id:           b.id,
          guest_name:   b.user_id ? (b.users?.full_name ?? null) : (b.guest_name ?? null),
          guest_phone:  b.user_id ? (b.users?.phone    ?? null) : (b.guest_phone ?? null),
          start_time:   b.start_time,
          end_time:     b.end_time,
          booking_mode: b.booking_mode ?? 'offline',
          status:       b.status,
        }
      : undefined

    return {
      id: s.id, row_label: s.row_label ?? '', column_number: s.column_number ?? 0,
      is_active: s.is_active ?? false, live_status, current_booking,
    }
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOGGLE SEAT ACTIVE  (senior_staff)
═══════════════════════════════════════════════════════════════════════════ */

export async function seniorToggleSeatActive(
  seatId:    string,
  libraryId: string,
  is_active: boolean,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Gate: senior_staff for this library
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!staffRow || staffRow.role !== 'senior_staff')
    return { success: false, error: 'Access denied — senior staff only' }

  // Confirm seat belongs to this library
  const seat = await getSeatById(supabase, seatId)

  if (!seat || seat.library_id !== libraryId)
    return { success: false, error: 'Seat not found in this library' }

  const { error } = await setSeatActive(supabase, seatId, is_active)

  if (error) {
    logError('seniorToggleSeatActive', 'Update failed', error)
    return { success: false, error: error.message }
  }

  log('seniorToggleSeatActive', `seat=${seatId} is_active=${is_active} by staff=${user.id}`)
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADD SEAT ROW  (senior_staff)
═══════════════════════════════════════════════════════════════════════════ */

export async function seniorAddSeatRow(
  libraryId: string,
  rowLabel:  string,
  numSeats:  number,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Gate: senior_staff for this library
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!staffRow || staffRow.role !== 'senior_staff')
    return { success: false, error: 'Access denied — senior staff only' }

  const label = rowLabel.toUpperCase().trim()
  if (!/^[A-Z]$/.test(label))
    return { success: false, error: 'Row label must be a single letter A–Z' }
  if (numSeats < 1 || numSeats > 50)
    return { success: false, error: 'Seats must be between 1 and 50' }

  const existing = await rowLabelExists(supabase, libraryId, label)

  if (existing)
    return { success: false, error: `Row ${label} already exists in this library` }

  const seats = Array.from({ length: numSeats }, (_, i) => ({
    library_id: libraryId, row_label: label, column_number: i + 1, is_active: true,
  }))

  const { error } = await insertSeats(supabase, seats)
  if (error) {
    logError('seniorAddSeatRow', 'Insert failed', error)
    return { success: false, error: error.message }
  }

  log('seniorAddSeatRow', `library=${libraryId} row=${label} seats=${numSeats} by staff=${user.id}`)
  revalidatePath('/staff/seat-manager')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MANUAL WALK-IN BOOKING  (senior_staff)
═══════════════════════════════════════════════════════════════════════════ */

export async function seniorManualBook(
  input: SeniorManualBookInput,
): Promise<ActionResult<{ bookingId: string }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Staff-specific authorization — must be senior_staff for this library.
  // Intentionally NOT shared with owner's authorization (owner checks
  // libraries.owner_id instead); everything after this belongs to
  // createManualBooking, shared with owner.ts's manualBookSeat. See
  // services/booking/createManualBooking.ts.
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('library_id', input.libraryId)
    .maybeSingle()

  if (!staffRow || staffRow.role !== 'senior_staff')
    return { success: false, error: 'Access denied — senior staff only' }

  return createManualBooking(supabase, input, 'seniorManualBook')
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORCE FREE SEAT  (senior_staff)
═══════════════════════════════════════════════════════════════════════════ */

export async function seniorForceFree(
  seatId:    string,
  libraryId: string,
): Promise<ActionResult<{ cancelledBookingId: string }>> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Gate: senior_staff for this library
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('library_id', libraryId)
    .maybeSingle()

  if (!staffRow || staffRow.role !== 'senior_staff')
    return { success: false, error: 'Access denied — senior staff only' }

  const now = nowIST()

  const { data: active } = await supabase
    .from('bookings').select('id')
    .eq('seat_id', seatId)
    .eq('library_id', libraryId)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])
    .lte('start_time', now)
    .gte('end_time', now)
    .order('start_time', { ascending: false })
    .limit(1)

  if (!active?.length)
    return { success: false, error: 'No active booking found for this seat right now' }

  const bookingId = active[0].id
  const { error } = await setBookingStatus(supabase, bookingId, 'cancelled')

  if (error) {
    logError('seniorForceFree', 'Update failed', error)
    return { success: false, error: error.message }
  }

  log('seniorForceFree', `cancelled booking=${bookingId} seat=${seatId} by staff=${user.id}`)
  revalidatePath('/staff')
  revalidatePath('/staff/seat-manager')
  // Owner must also see the freed seat
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/dashboard')
  return { success: true, data: { cancelledBookingId: bookingId } }
}