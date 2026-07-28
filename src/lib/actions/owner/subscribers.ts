'use server'

// src/lib/actions/owner/subscribers.ts
// Owner visibility into subscription activity — "who's subscribed, which
// seat do they hold, have they been showing up" — the primary place for
// owners/staff to manage subscribed students (per the subscription-model
// spec's "Owner Dashboard" section). No quota/session concept anymore —
// attendance (from subscription_attendance, driven by QR scans) replaces
// session-consumption tracking.

import { getSupabaseUser } from '@/lib/supabase/server'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'
import { logError } from '@/lib/logger'

export type SubscriberAttendanceEntry = {
  id:            string
  checkInTime:   string
  checkOutTime:  string | null
}

export type LibrarySubscriber = {
  subscriptionId:  string
  studentName:     string
  studentWhatsapp: string | null
  planName:        string
  status:          string
  startDate:       string
  endDate:         string
  seatLabel:       string | null
  timeWindowStart: string | null
  timeWindowEnd:   string | null
  daysOfWeek:      number[] | null
  isExpired:       boolean
  attendanceCount: number
  lastCheckIn:     string | null
  attendance:      SubscriberAttendanceEntry[]
}

export async function getLibrarySubscribers(libraryId: string): Promise<LibrarySubscriber[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return []

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select(`
      id, user_id, plan_id, status, start_date, end_date, seat_id,
      plans(name, time_window_start, time_window_end, days_of_week),
      seats(row_label, column_number)
    `)
    .eq('library_id', libraryId)
    .in('status', ['active', 'pending', 'expired'] as never[])
    .order('start_date', { ascending: false })

  if (error || !subs?.length) { if (error) logError('getLibrarySubscribers', 'Fetch failed', error); return [] }

  const { data: students } = await supabase
    .from('users').select('id, full_name, name, phone, whatsapp_number').in('id', (subs as any[]).map(s => s.user_id))
  const studentById = new Map((students as any[] ?? []).map(u => [u.id, u]))

  const subIds = (subs as any[]).map(s => s.id)
  const { data: attendanceRows } = await supabase
    .from('subscription_attendance')
    .select('id, subscription_id, check_in_time, check_out_time')
    .in('subscription_id', subIds)
    .order('check_in_time', { ascending: false })

  const attendanceBySub = new Map<string, SubscriberAttendanceEntry[]>()
  for (const a of (attendanceRows as any[] ?? [])) {
    const list = attendanceBySub.get(a.subscription_id) ?? []
    list.push({ id: a.id, checkInTime: a.check_in_time, checkOutTime: a.check_out_time })
    attendanceBySub.set(a.subscription_id, list)
  }

  const nowMs = Date.now()

  return (subs as any[]).map((s): LibrarySubscriber => {
    const plan       = s.plans as any
    const seat        = s.seats as any
    const student     = studentById.get(s.user_id)
    const endMs       = s.end_date ? new Date((s.end_date as string) + '+05:30').getTime() : 0
    const isExpired   = endMs > 0 && endMs < nowMs
    const attendance  = attendanceBySub.get(s.id) ?? []

    return {
      subscriptionId:  s.id,
      studentName:     student?.full_name ?? student?.name ?? 'Student',
      studentWhatsapp: student?.whatsapp_number ?? student?.phone ?? null,
      planName:        plan?.name ?? 'Membership plan',
      status:          isExpired && s.status === 'active' ? 'expired' : s.status,
      startDate:       s.start_date,
      endDate:         s.end_date,
      seatLabel:       seat ? `${seat.row_label}${seat.column_number}` : null,
      timeWindowStart: plan?.time_window_start ?? null,
      timeWindowEnd:   plan?.time_window_end ?? null,
      daysOfWeek:      plan?.days_of_week ?? null,
      isExpired,
      attendanceCount: attendance.length,
      lastCheckIn:     attendance[0]?.checkInTime ?? null,
      attendance,
    }
  })
}
