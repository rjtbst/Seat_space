'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/auth'
import { nowIST } from '@/lib/ist'
import { log, logError } from '@/lib/logger'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'
import { normalisePhone } from '@/lib/utils'
import { getEligibleSubscriptions, type EligibleSubscription } from '@/lib/booking/subscriptionEntitlement'
import { z } from 'zod'

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */

export type StaffMember = {
  staffId:   string
  userId:    string
  fullName:  string
  phone:     string | null
  role:      string | null
  libraryId: string
}

export type PendingRequest = {
  requestId:   string
  userId:      string
  fullName:    string
  phone:       string | null
  message:     string | null
  libraryId:   string
  libraryName: string
  createdAt:   string
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/** Resolve display name — the users table has both `name` and `full_name` columns. */
function resolveName(u: any): string {
  return u?.full_name?.trim() || u?.name?.trim() || '—'
}

/** Strip spaces / +91 / leading 0 to get a bare 10-digit number. */
/**
 * Fetch a map of userId → user row for a list of IDs.
 *
 * WHY A SEPARATE QUERY INSTEAD OF A JOIN:
 * Supabase PostgREST foreign-table joins respect the RLS policies of the
 * *joined* table. If `users` has a policy like "users can only read their
 * own row", the join silently returns null for every other user — giving
 * you "Unknown" names even though the data exists. Querying `users`
 * directly in a server action (which runs with the authenticated session)
 * lets Supabase evaluate the policy against the *owner* user, who typically
 * has broader read access, or you can grant it explicitly via a policy.
 *
 * If names are STILL null after this change, add this RLS policy in Supabase:
 *   CREATE POLICY "owners and staff can read user profiles"
 *   ON public.users FOR SELECT
 *   USING (true);   -- or scope it more tightly as needed
 */
async function fetchUsersById(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userIds: string[],
): Promise<Record<string, { fullName: string; phone: string | null }>> {
  if (!userIds.length) return {}

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, name, phone')
    .in('id', userIds)

  if (error) {
    logError('fetchUsersById', 'Batch user lookup failed', error)
    return {}
  }

  const map: Record<string, { fullName: string; phone: string | null }> = {}
  for (const u of data ?? []) {
    map[u.id] = {
      fullName: resolveName(u),
      phone:    u.phone ?? null,
    }
  }
  return map
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET ACTIVE STAFF FOR ALL OWNER LIBRARIES
═══════════════════════════════════════════════════════════════════════════ */

export async function getOwnerStaff(): Promise<StaffMember[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data: libs, error: libErr } = await supabase
    .from('libraries').select('id').eq('owner_id', user.id)

  if (libErr || !libs?.length) return []

  const libIds = libs.map(l => l.id)

  const { data, error } = await supabase
    .from('staff')
    .select('id, role, library_id, user_id')   // no join — fetch users separately
    .in('library_id', libIds)
    .order('library_id')

  if (error || !data) return []

  const userIds  = [...new Set(data.map(r => r.user_id).filter((id): id is string => Boolean(id)))]
  const usersMap = await fetchUsersById(supabase, userIds)

  return data.map((row: any) => ({
    staffId:   row.id,
    userId:    row.user_id,
    fullName:  usersMap[row.user_id]?.fullName ?? '—',
    phone:     usersMap[row.user_id]?.phone    ?? null,
    role:      row.role                        ?? null,
    libraryId: row.library_id,
  }))
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET PENDING REQUESTS FOR ALL OWNER LIBRARIES
═══════════════════════════════════════════════════════════════════════════ */

export async function getPendingRequests(): Promise<PendingRequest[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data: libs } = await supabase
    .from('libraries').select('id, name').eq('owner_id', user.id)

  if (!libs?.length) return []

  const libIds   = libs.map(l => l.id)
  const libNames = Object.fromEntries(libs.map(l => [l.id, l.name ?? '']))

  const { data, error } = await supabase
    .from('staff_requests')
    .select('id, user_id, library_id, message, created_at')  // no join — fetch users separately
    .in('library_id', libIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })   // oldest first → FIFO

  if (error || !data) return []

  const userIds  = [...new Set(data.map(r => r.user_id).filter((id): id is string => Boolean(id)))]
  const usersMap = await fetchUsersById(supabase, userIds)

  return data.map((row: any) => ({
    requestId:   row.id,
    userId:      row.user_id,
    fullName:    usersMap[row.user_id]?.fullName ?? '—',
    phone:       usersMap[row.user_id]?.phone    ?? null,
    message:     row.message                     ?? null,
    libraryId:   row.library_id,
    libraryName: libNames[row.library_id]        ?? '',
    createdAt:   row.created_at                  ?? '',
  }))
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACCEPT REQUEST
═══════════════════════════════════════════════════════════════════════════ */

export async function acceptStaffRequest(
  requestId: string,
  role = 'staff',
): Promise<ActionResult<{ staffId: string }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: req, error: reqErr } = await supabase
    .from('staff_requests')
    .select('id, user_id, library_id, status, libraries(owner_id)')
    .eq('id', requestId)
    .maybeSingle()

  if (reqErr || !req) return { success: false, error: 'Request not found' }

  const ownerId = Array.isArray(req.libraries)
    ? (req.libraries[0] as any)?.owner_id
    : (req.libraries as any)?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  if (req.status !== 'pending')
    return { success: false, error: `Request is already ${req.status}` }

  if (!req.user_id || !req.library_id)
    return { success: false, error: 'Request is missing user or library reference' }

  const { data: existingStaff } = await supabase
    .from('staff').select('id')
    .eq('user_id', req.user_id).eq('library_id', req.library_id).maybeSingle()

  if (existingStaff) {
    await supabase.from('staff_requests')
      .update({ status: 'accepted', reviewed_at: nowIST() } as never)
      .eq('id', requestId)
    return { success: true, data: { staffId: existingStaff.id } }
  }

  const { data: newStaff, error: staffErr } = await supabase
    .from('staff')
    .insert({ user_id: req.user_id, library_id: req.library_id, role } as never)
    .select('id').single()

  if (staffErr || !newStaff) {
    logError('acceptStaffRequest', 'Staff insert failed', staffErr)
    return { success: false, error: staffErr?.message ?? 'Failed to add staff' }
  }

  await supabase.from('staff_requests')
    .update({ status: 'accepted', reviewed_at: nowIST() } as never)
    .eq('id', requestId)

  log('acceptStaffRequest', `request=${requestId} → staff=${newStaff.id}`)
  revalidatePath('/dashboard/staff')
  return { success: true, data: { staffId: newStaff.id } }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REJECT REQUEST
═══════════════════════════════════════════════════════════════════════════ */

export async function rejectStaffRequest(requestId: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: req } = await supabase
    .from('staff_requests')
    .select('id, status, libraries(owner_id)')
    .eq('id', requestId)
    .maybeSingle()

  if (!req) return { success: false, error: 'Request not found' }

  const ownerId = Array.isArray(req.libraries)
    ? (req.libraries[0] as any)?.owner_id
    : (req.libraries as any)?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  if (req.status !== 'pending')
    return { success: false, error: `Request is already ${req.status}` }

  const { error } = await supabase.from('staff_requests')
    .update({ status: 'rejected', reviewed_at: nowIST() } as never)
    .eq('id', requestId)

  if (error) { logError('rejectStaffRequest', 'Update failed', error); return { success: false, error: error.message } }

  log('rejectStaffRequest', `request=${requestId} rejected by owner=${user.id}`)
  revalidatePath('/dashboard/staff')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADD STAFF DIRECTLY BY PHONE
═══════════════════════════════════════════════════════════════════════════ */

export async function addStaffByPhone(
  phone:     string,
  libraryId: string,
  role = 'staff',
): Promise<ActionResult<{ staffId: string; fullName: string }>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id)
    return { success: false, error: 'Library not found or access denied' }

  const normalized = normalisePhone(phone)
  if (normalized.length !== 10 || !/^\d{10}$/.test(normalized))
    return { success: false, error: 'Enter a valid 10-digit Indian mobile number' }

  // Try bare 10-digit first, then +91-prefixed — two safe .eq() calls
  // avoids the PostgREST .or() issue with '+' being a reserved character
  let resolvedUser: any = null

  const { data: u1, error: e1 } = await supabase
    .from('users')
    .select('id, full_name, name, phone, role')
    .eq('phone', normalized)
    .maybeSingle()

  if (e1) { logError('addStaffByPhone', 'Lookup (bare) failed', e1); return { success: false, error: 'Lookup failed — try again' } }
  resolvedUser = u1

  if (!resolvedUser) {
    const { data: u2, error: e2 } = await supabase
      .from('users')
      .select('id, full_name, name, phone, role')
      .eq('phone', `+91${normalized}`)
      .maybeSingle()
    if (e2) { logError('addStaffByPhone', 'Lookup (+91) failed', e2); return { success: false, error: 'Lookup failed — try again' } }
    resolvedUser = u2
  }

  if (!resolvedUser)
    return { success: false, error: `No user found with phone ${normalized}. Ask them to register first.` }

  if (resolvedUser.role !== 'staff')
    return { success: false, error: `This user is registered as '${resolvedUser.role}', not staff.` }

  const { data: existing } = await supabase.from('staff').select('id')
    .eq('user_id', resolvedUser.id).eq('library_id', libraryId).maybeSingle()
  if (existing)
    return { success: false, error: `${resolveName(resolvedUser)} is already staff here` }

  const { data: inserted, error: insertErr } = await supabase
    .from('staff')
    .insert({ user_id: resolvedUser.id, library_id: libraryId, role } as never)
    .select('id')
    .single()

  if (insertErr || !inserted) {
    logError('addStaffByPhone', 'Insert failed', insertErr)
    return { success: false, error: insertErr?.message ?? 'Failed to add staff' }
  }

  const fullName = resolveName(resolvedUser)
  log('addStaffByPhone', `staff=${inserted.id} user=${resolvedUser.id} library=${libraryId}`)
  revalidatePath('/dashboard/staff')
  return { success: true, data: { staffId: inserted.id, fullName } }
}

/* ═══════════════════════════════════════════════════════════════════════════
   REMOVE STAFF
═══════════════════════════════════════════════════════════════════════════ */

export async function removeStaff(staffId: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: staffRow } = await supabase.from('staff')
    .select('id, library_id, libraries(owner_id)').eq('id', staffId).maybeSingle()
  if (!staffRow) return { success: false, error: 'Staff record not found' }

  const ownerId = Array.isArray(staffRow.libraries)
    ? (staffRow.libraries[0] as any)?.owner_id
    : (staffRow.libraries as any)?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const { error } = await supabase.from('staff').delete().eq('id', staffId)
  if (error) { logError('removeStaff', 'Delete failed', error); return { success: false, error: error.message } }

  log('removeStaff', `staff=${staffId} removed by owner=${user.id}`)
  revalidatePath('/dashboard/staff')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   UPDATE STAFF ROLE
═══════════════════════════════════════════════════════════════════════════ */

export async function updateStaffRole(staffId: string, role: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: staffRow } = await supabase.from('staff')
    .select('id, library_id, libraries(owner_id)').eq('id', staffId).maybeSingle()
  if (!staffRow) return { success: false, error: 'Staff record not found' }

  const ownerId = Array.isArray(staffRow.libraries)
    ? (staffRow.libraries[0] as any)?.owner_id
    : (staffRow.libraries as any)?.owner_id
  if (ownerId !== user.id) return { success: false, error: 'Access denied' }

  const { error } = await supabase.from('staff').update({ role } as never).eq('id', staffId)
  if (error) { logError('updateStaffRole', 'Update failed', error); return { success: false, error: error.message } }

  log('updateStaffRole', `staff=${staffId} role=${role}`)
  revalidatePath('/dashboard/staff')
  return { success: true, data: undefined }
}

/* ═══════════════════════════════════════════════════════════════════════════
   WALK-IN STUDENT — LOOK UP BY PHONE, BOOK AGAINST THEIR SUBSCRIPTION
   ─────────────────────────────────────────────────────────────────────────
   For the case where a subscribed student shows up in person instead of
   booking from their phone — owner/staff look them up by phone number and
   book them in against their existing subscription, same as the self-
   service flow but recorded as a walk-in (booking_mode='offline'). Reuses
   the exact same entitlement computation (lib/booking/subscriptionEntitlement.ts)
   and the exact same atomic RPC (create_subscription_covered_booking) as
   the student's own booking flow — the RPC's authorization already accepts
   either the student themselves OR an owner/staff member for the library,
   so no separate booking-mechanics copy exists for this path.
═══════════════════════════════════════════════════════════════════════════ */

export type WalkInStudentMatch = {
  userId:        string
  fullName:      string
  phone:         string
  subscriptions: EligibleSubscription[]
}

export async function findStudentForWalkIn(
  phone: string,
  libraryId: string,
): Promise<ActionResult<WalkInStudentMatch>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  const isOwner = ownerId === user.id
  let isStaff = false
  if (!isOwner) {
    const { data: staffRow } = await supabase
      .from('staff').select('id').eq('user_id', user.id).eq('library_id', libraryId).maybeSingle()
    isStaff = !!staffRow
  }
  if (!isOwner && !isStaff) return { success: false, error: 'Access denied' }

  const normalized = normalisePhone(phone)
  if (normalized.length !== 10 || !/^\d{10}$/.test(normalized))
    return { success: false, error: 'Enter a valid 10-digit Indian mobile number' }

  // Same bare-then-+91 lookup pattern as addStaffByPhone above.
  let resolvedUser: any = null
  const { data: u1 } = await supabase.from('users').select('id, full_name, name, phone, role')
    .eq('phone', normalized).maybeSingle()
  resolvedUser = u1
  if (!resolvedUser) {
    const { data: u2 } = await supabase.from('users').select('id, full_name, name, phone, role')
      .eq('phone', `+91${normalized}`).maybeSingle()
    resolvedUser = u2
  }

  if (!resolvedUser)
    return { success: false, error: `No user found with phone ${normalized}. They need to register first.` }
  if (resolvedUser.role !== 'student')
    return { success: false, error: `This user is registered as '${resolvedUser.role}', not a student.` }

  const subscriptions = await getEligibleSubscriptions(supabase, resolvedUser.id, libraryId)

  return {
    success: true,
    data: {
      userId:   resolvedUser.id,
      fullName: resolvedUser.full_name ?? resolvedUser.name ?? 'Student',
      phone:    resolvedUser.phone,
      subscriptions,
    },
  }
}

const staffBookViaSubscriptionSchema = z.object({
  studentUserId:  z.string().uuid(),
  subscriptionId: z.string().uuid(),
  libraryId:      z.string().uuid(),
  seatId:         z.string().uuid(),
  startTime:      z.string().min(1),
  endTime:        z.string().min(1),
})

export async function staffBookSeatViaSubscription(
  input: z.infer<typeof staffBookViaSubscriptionSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = staffBookViaSubscriptionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { studentUserId, subscriptionId, libraryId, seatId } = parsed.data
  const start = parsed.data.startTime
  const end   = parsed.data.endTime

  // Authorization is re-checked authoritatively INSIDE the RPC (owner_id
  // or staff row for this library) — this outer check exists only to fail
  // fast with a clean message before touching the seat/subscription rows.
  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  const isOwner = ownerId === user.id
  let isStaff = false
  if (!isOwner) {
    const { data: staffRow } = await supabase
      .from('staff').select('id').eq('user_id', user.id).eq('library_id', libraryId).maybeSingle()
    isStaff = !!staffRow
  }
  if (!isOwner && !isStaff) return { success: false, error: 'Access denied' }

  const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
    'create_subscription_covered_booking',
    {
      p_user_id:         studentUserId,
      p_subscription_id: subscriptionId,
      p_library_id:      libraryId,
      p_seat_id:         seatId,
      p_start_time:      start,
      p_end_time:        end,
    },
  )

  if (rpcErr) return { success: false, error: rpcErr.message ?? 'Failed to book seat' }

  if (!rpcResult?.success) {
    const errorMessages: Record<string, string> = {
      not_authorized:              'Access denied',
      subscription_not_found:      'Subscription not found',
      subscription_not_active:     'This subscription is not active',
      subscription_expired:        'This subscription has expired',
      plan_not_found:               'Plan not found',
      plan_not_valid_for_library:   'This plan does not cover this library',
      seat_conflict:               'This seat was just booked by someone else. Please choose another seat.',
    }
    if (rpcResult?.error === 'outside_plan_time_window') {
      const winStart = (rpcResult.time_window_start as string | undefined)?.slice(0, 5)
      const winEnd   = (rpcResult.time_window_end as string | undefined)?.slice(0, 5)
      return {
        success: false,
        error: winStart && winEnd
          ? `This student's plan only covers ${winStart}–${winEnd}. Book this slot as a paid seat instead, or pick a time inside that window.`
          : 'This booking falls outside the student\'s plan hours.',
      }
    }
    if (rpcResult?.error === 'outside_plan_days') {
      const days = (rpcResult.days_of_week as number[] | undefined)
      const dayNames = days?.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
      return {
        success: false,
        error: dayNames
          ? `This student's plan is only valid on ${dayNames}. Book as a paid seat instead, or pick a day the plan covers.`
          : 'This booking falls outside the student\'s plan days.',
      }
    }
    return { success: false, error: errorMessages[rpcResult?.error] ?? 'Failed to book seat' }
  }

  log('staffBookSeatViaSubscription', `booking=${rpcResult.booking_id} student=${studentUserId} seat=${seatId} by=${user.id}`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard/seat-manager')
  revalidatePath('/staff/seat-manager')
  revalidatePath('/staff')

  return { success: true, data: { bookingId: rpcResult.booking_id } }
}