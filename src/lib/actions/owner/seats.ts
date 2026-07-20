'use server'

// src/lib/actions/owner/seats.ts
// Split from owner.ts (Phase 4 / Priority 2.1) — seat layout, seat CRUD,
// manual walk-in booking, extend, and force-free.

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log, logError, timed } from '@/lib/logger'
import { nowIST } from '@/lib/ist'
import { fetchActiveSlotConfigs } from '@/lib/booking/slotConfigService'
import { validateBooking } from '@/lib/booking/slotBoundaryValidation'
import { createManualBooking } from '@/services/booking/createManualBooking'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'
import { setBookingStatus } from '@/repositories/bookings.repository'
import {
  listSeatLayout,
  getSeatWithLibraryOwner,
  setSeatActive,
  rowLabelExists,
  insertSeats,
  listSeatsInRow,
  renameSeatRow,
  deleteSeatsByIds,
} from '@/repositories/seats.repository'

/* ═══════════════════════════════════════════════════════════════════════════
   SEAT MANAGER
═══════════════════════════════════════════════════════════════════════════ */
export type ActiveBooking = {
  id:           string
  guest_name:   string | null
  guest_phone:  string | null
  start_time:   string
  end_time:     string
  booking_mode: 'online' | 'offline'
  status:       string
}

export type SeatRow = {
  id:              string
  row_label:       string
  column_number:   number
  is_active:       boolean
  live_status:     'free' | 'booked' | 'held' | 'inactive'
  current_booking?: ActiveBooking
}

export async function getSeatLayout(libraryId: string): Promise<SeatRow[]> {
  return timed('getSeatLayout', `library=${libraryId}`, async () => {
    const { supabase, user } = await getSupabaseUser()
    if (!user) return []

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
      // Option B: treat a held booking whose hold window has expired as if it
      // doesn't exist — the seat shows free immediately without needing a cron.
      // The DB EXCLUDE constraint still prevents any actual double-booking at
      // write time, so this is purely a UI accuracy fix.
      if (b.status === 'held' && b.hold_expires_at) {
        const expiresMs = new Date(b.hold_expires_at).getTime()
        if (expiresMs < nowMs) continue   // skip — treat as free
      }
      if (!b.seat_id) continue
      if (!bookingBySeat.has(b.seat_id)) bookingBySeat.set(b.seat_id, b)
    }

    return seatData.map((s) => {
      const b = bookingBySeat.get(s.id)

      const live_status: SeatRow['live_status'] = !s.is_active
        ? 'inactive'
        : !b
          ? 'free'
          : ['confirmed', 'checked_in'].includes(b.status)
            ? 'booked'
            : 'held'

      const current_booking: ActiveBooking | undefined = b
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
        is_active: !!s.is_active, live_status, current_booking,
      }
    })
  })
}

export async function toggleSeatActive(
  seatId:    string,
  libraryId: string,
  is_active: boolean,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const seat = await getSeatWithLibraryOwner(supabase, seatId)

  if (!seat) return { success: false, error: 'Seat not found' }
  if (seat.ownerId !== user.id) return { success: false, error: 'Access denied' }

  const { error } = await setSeatActive(supabase, seatId, is_active)
  if (error) { logError('toggleSeatActive', 'Update failed', error); return { success: false, error: error.message } }

  log('toggleSeatActive', `seat=${seatId} is_active=${is_active}`)
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/dashboard')
  return { success: true, data: undefined }
}

export async function addSeatRow(
  libraryId: string,
  rowLabel:  string,
  numSeats:  number,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const label = rowLabel.toUpperCase().trim()
  if (!/^[A-Z]$/.test(label)) return { success: false, error: 'Row label must be a single letter A–Z' }
  if (numSeats < 1 || numSeats > 50) return { success: false, error: 'Seats must be between 1 and 50' }

  const existing = await rowLabelExists(supabase, libraryId, label)
  if (existing) return { success: false, error: `Row ${label} already exists` }

  const seats = Array.from({ length: numSeats }, (_, i) => ({
    library_id: libraryId, row_label: label, column_number: i + 1, is_active: true,
  }))

  const { error } = await insertSeats(supabase, seats)
  if (error) { logError('addSeatRow', 'Insert failed', error); return { success: false, error: error.message } }

  log('addSeatRow', `library=${libraryId} row=${label} seats=${numSeats}`)
  revalidatePath('/dashboard/seat-manager')
  return { success: true, data: undefined }
}

export async function editSeatRow(
  libraryId: string,
  oldLabel:  string,
  newLabel:  string,
  newCount:  number,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const normalOld = oldLabel.toUpperCase().trim()
  const normalNew = newLabel.toUpperCase().trim()
  if (!/^[A-Z]$/.test(normalNew)) return { success: false, error: 'Row label must be a single letter A–Z' }
  if (newCount < 1 || newCount > 50) return { success: false, error: 'Seats must be between 1 and 50' }

  if (normalNew !== normalOld) {
    const clash = await rowLabelExists(supabase, libraryId, normalNew)
    if (clash) return { success: false, error: `Row ${normalNew} already exists` }
  }

  const existing = await listSeatsInRow(supabase, libraryId, normalOld)
  if (!existing.length) return { success: false, error: 'Could not fetch row seats' }

  // Rename first if needed
  if (normalNew !== normalOld) {
    const { error: renameErr } = await renameSeatRow(supabase, libraryId, normalOld, normalNew)
    if (renameErr) { logError('editSeatRow', 'Rename failed', renameErr); return { success: false, error: renameErr.message } }
  }

  const currentCount = existing.length

  if (newCount > currentCount) {
    const toAdd = Array.from({ length: newCount - currentCount }, (_, i) => ({
      library_id:    libraryId,
      row_label:     normalNew,
      column_number: currentCount + i + 1,
      is_active:     true,
    }))
    const { error: insertErr } = await insertSeats(supabase, toAdd)
    if (insertErr) { logError('editSeatRow', 'Insert failed', insertErr); return { success: false, error: insertErr.message } }
  } else if (newCount < currentCount) {
    const toRemove = existing.slice(newCount).map((s) => s.id)
    const { error: deleteErr } = await deleteSeatsByIds(supabase, toRemove)
    if (deleteErr) { logError('editSeatRow', 'Delete failed', deleteErr); return { success: false, error: deleteErr.message } }
  }

  log('editSeatRow', `library=${libraryId} ${normalOld}→${normalNew} seats=${newCount}`)
  revalidatePath('/dashboard/seat-manager')
  return { success: true, data: undefined }
}
/* ═══════════════════════════════════════════════════════════════════════════
   MANUAL WALK-IN BOOKING
═══════════════════════════════════════════════════════════════════════════ */
export type ManualBookInput = {
  seatId:      string
  libraryId:   string
  userName:    string
  userPhone:   string
  startTime:   string
  endTime:     string
  bookingMode: 'online' | 'offline'
  amountPaid:  number
  paymentMode: 'cash' | 'upi' | 'other'
  paymentNote: string
}

export async function manualBookSeat(
  input: ManualBookInput,
): Promise<ActionResult<{ bookingId: string }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Owner-specific authorization — must own the library. This check is
  // intentionally NOT shared with staff's authorization (staff checks the
  // `staff` table for senior_staff instead); everything after this belongs
  // to createManualBooking, shared with staff-seat-actions.ts's
  // seniorManualBook. See services/booking/createManualBooking.ts.
  const ownerId = await getLibraryOwnerId(supabase, input.libraryId)

  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  return createManualBooking(supabase, input, 'manualBookSeat')
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXTEND BOOKING
═══════════════════════════════════════════════════════════════════════════ */
export async function extendBooking(
  bookingId:  string,
  libraryId:  string,
  newEndTime: string,
): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, seat_id, start_time, end_time, status')
    .eq('id', bookingId)
    .eq('library_id', libraryId)
    .maybeSingle()

  if (fetchErr || !booking) return { success: false, error: 'Booking not found' }
  if (!['confirmed', 'checked_in'].includes(booking.status as string))
    return { success: false, error: 'Can only extend confirmed or checked-in bookings' }
  if (!booking.seat_id || !booking.start_time || !booking.end_time)
    return { success: false, error: 'Booking is missing required fields' }

  const newEndMs     = new Date(newEndTime       + '+05:30').getTime()
  const currentEndMs = new Date(booking.end_time + '+05:30').getTime()
  const startMs      = new Date(booking.start_time + '+05:30').getTime()

  if (isNaN(newEndMs))          return { success: false, error: 'Invalid end time format' }
  if (newEndMs <= currentEndMs) return { success: false, error: 'New end time must be after current end time' }
  if (newEndMs - startMs > 24 * 3_600_000)
    return { success: false, error: 'Total booking duration cannot exceed 24 hours' }

  // SLOT-ONLY ARCHITECTURE: the extended [start, newEnd) range must still fit
  // entirely inside the same active slot that contained the original
  // booking — extending past a slot's end is the same as the slot-boundary
  // rejection at creation time (lib/booking/slotBoundaryValidation.ts).
  const slots = await fetchActiveSlotConfigs(supabase, libraryId)
  const windowCheck = validateBooking({
    slots,
    startTime: booking.start_time as string,
    endTime:   newEndTime,
  })
  if (windowCheck.ok === false) return { success: false, error: windowCheck.error }

  const { data: conflict } = await supabase
    .from('bookings')
    .select('id')
    .eq('seat_id', booking.seat_id)
    .neq('id', bookingId)
    .in('status', ['confirmed', 'checked_in', 'held'] as never[])
    .lt('start_time', newEndTime)
    .gt('end_time', booking.end_time)

  if (conflict && conflict.length > 0)
    return { success: false, error: 'Another booking conflicts with the extended slot' }

  const { error: updateErr } = await supabase
    .from('bookings').update({ end_time: newEndTime } as never).eq('id', bookingId)

  if (updateErr) { logError('extendBooking', 'Update failed', updateErr); return { success: false, error: updateErr.message } }


  log('extendBooking', `booking=${bookingId} extended to ${newEndTime}`)
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/dashboard')
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORCE FREE SEAT
═══════════════════════════════════════════════════════════════════════════ */
export async function forceFreeSeat(
  seatId:    string,
  libraryId: string,
): Promise<ActionResult<{ cancelledBookingId: string }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const now = nowIST()
  const { data: active } = await supabase
    .from('bookings')
    .select('id')
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

  if (error) { logError('forceFreeSeat', 'Update failed', error); return { success: false, error: error.message } }

  log('forceFreeSeat', `cancelled booking=${bookingId} seat=${seatId}`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/seat-manager')
  // Staff seat manager must also see the freed seat
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')
  return { success: true, data: { cancelledBookingId: bookingId } }
}

