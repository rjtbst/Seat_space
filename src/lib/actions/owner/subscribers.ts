'use server'

// src/lib/actions/owner/subscribers.ts
// Owner visibility into subscription activity — "who's subscribed, how
// much of their plan have they used" — so a subscription isn't a black
// box once purchased. Session consumption is always derived live from the
// bookings table (never a separate counter), same principle as
// lib/booking/subscriptionEntitlement.ts.

import { getSupabaseUser } from '@/lib/supabase/server'
import { getLibraryOwnerId } from '@/repositories/libraries.repository'
import { logError } from '@/lib/logger'

export type LibrarySubscriber = {
  subscriptionId:  string
  studentName:     string
  studentWhatsapp: string | null
  planName:        string
  status:          string
  startDate:       string
  endDate:         string
  sessionsUsed:    number
  sessionsLimit:   number | null   // null = unlimited
  isExpired:       boolean
}

export async function getLibrarySubscribers(libraryId: string): Promise<LibrarySubscriber[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const ownerId = await getLibraryOwnerId(supabase, libraryId)
  if (ownerId !== user.id) return []

  // Plans that cover this library
  const { data: links } = await supabase
    .from('plan_libraries').select('plan_id').eq('library_id', libraryId)
  const planIds = (links as any[] ?? []).map(l => l.plan_id)
  if (planIds.length === 0) return []

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, plan_id, status, start_date, end_date')
    .in('plan_id', planIds)
    .in('status', ['active', 'pending', 'expired'] as never[])
    .order('start_date', { ascending: false })

  if (error || !subs?.length) { if (error) logError('getLibrarySubscribers', 'Fetch failed', error); return [] }

  const [{ data: plans }, { data: students }] = await Promise.all([
    supabase.from('plans').select('id, name, session_limit').in('id', planIds),
    supabase.from('users').select('id, full_name, name, phone, whatsapp_number').in('id', (subs as any[]).map(s => s.user_id)),
  ])

  const planById    = new Map((plans as any[] ?? []).map(p => [p.id, p]))
  const studentById = new Map((students as any[] ?? []).map(u => [u.id, u]))

  const nowMs = Date.now()
  const results: LibrarySubscriber[] = []

  for (const s of subs as any[]) {
    const plan    = planById.get(s.plan_id)
    const student = studentById.get(s.user_id)
    const limit   = plan?.session_limit != null ? parseInt(plan.session_limit, 10) : null
    const endMs   = s.end_date ? new Date((s.end_date as string) + '+05:30').getTime() : 0
    const isExpired = endMs > 0 && endMs < nowMs

    let used = 0
    if (limit !== null || s.status === 'active') {
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', s.id)
        .in('status', ['confirmed', 'checked_in', 'completed'] as never[])
      used = count ?? 0
    }

    results.push({
      subscriptionId: s.id,
      studentName:    student?.full_name ?? student?.name ?? 'Student',
      studentWhatsapp: student?.whatsapp_number ?? student?.phone ?? null,
      planName:       plan?.name ?? 'Membership plan',
      status:         isExpired && s.status === 'active' ? 'expired' : s.status,
      startDate:      s.start_date,
      endDate:        s.end_date,
      sessionsUsed:   used,
      sessionsLimit:  limit,
      isExpired,
    })
  }

  return results
}
