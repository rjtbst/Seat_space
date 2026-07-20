// lib/actions/admin-libraries.ts
'use server'

/**
 * Admin server actions — library approval/suspension workflow.
 *
 * Every function starts with requireActionRole('admin'), which re-checks
 * the caller's role server-side on every call (never trust a client-side
 * route guard alone). The underlying queries then run through the regular
 * cookie-based client — this is safe and sufficient here (no service-role
 * needed) because the `admin_manage_libraries` / `admin_manage_payments` /
 * etc. RLS policies already grant full access specifically to rows where
 * `public.is_admin()` is true for the calling session.
 */

import { revalidatePath } from 'next/cache'
import { requireActionRole } from '@/lib/auth/guards'
import { logError } from '@/lib/logger'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
import { countSeats } from '@/repositories/seats.repository'
import { getLibraryOwnerIdAndName } from '@/repositories/libraries.repository'
export type { ActionResult, ActionOk, ActionErr }

/* ══════════════════════════════════════════════════════════════════════════
   STATUS COUNTS (for filter tab badges — cheap head-count queries, not a
   full row fetch, so this stays fast regardless of total library count)
══════════════════════════════════════════════════════════════════════════ */

export type LibraryStatusCounts = {
  all: number
  pending: number
  approved: number
  rejected: number
  suspended: number
}

export async function getLibraryStatusCounts(): Promise<ActionResult<LibraryStatusCounts>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const statuses = ['pending', 'approved', 'rejected', 'suspended'] as const
  const [allCount, ...statusCounts] = await Promise.all([
    supabase.from('libraries').select('*', { count: 'exact', head: true }),
    ...statuses.map(s => supabase.from('libraries').select('*', { count: 'exact', head: true }).eq('approval_status', s)),
  ])

  return {
    success: true,
    data: {
      all: allCount.count ?? 0,
      pending: statusCounts[0].count ?? 0,
      approved: statusCounts[1].count ?? 0,
      rejected: statusCounts[2].count ?? 0,
      suspended: statusCounts[3].count ?? 0,
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LIST LIBRARIES (admin view — every library, any status)
══════════════════════════════════════════════════════════════════════════ */

export type AdminLibraryRow = {
  id: string
  name: string
  city: string
  area: string
  ownerId: string
  ownerName: string | null
  ownerPhone: string | null
  approvalStatus: string
  isActive: boolean
  submittedForReviewAt: string | null
  reviewedAt: string | null
  createdAt: string
  subscriptionStatus: string | null
  seatCount: number
}

export type PaginatedResult<T> = {
  rows: T[]
  nextCursor: string | null // pass back as `cursor` to fetch the next page; null means no more rows
}

const ADMIN_LIST_PAGE_SIZE = 50

export async function listLibrariesForAdmin(
  filter: 'all' | 'pending' | 'approved' | 'rejected' | 'suspended' = 'all',
  cursor: string | null = null,
): Promise<ActionResult<PaginatedResult<AdminLibraryRow>>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  // ── Cursor-based (keyset) pagination ───────────────────────────────────
  // AUDIT FIX: this query previously had NO limit at all — it fetched
  // every library row in the system on every page load. At 10,000+
  // libraries that is an unbounded query that will eventually time out or
  // exhaust memory; it also re-fetches every owner/subscription/seat-count
  // join on every load regardless of how many rows the admin actually
  // looks at. Cursor pagination here uses (created_at, id) — see the
  // idx_libraries_created_at_id_keyset index — rather than OFFSET, which
  // degrades badly at depth (OFFSET 5000 still scans and discards 5000
  // rows; keyset pagination does not).
  let query = supabase
    .from('libraries')
    .select(`
      id, name, city, area, owner_id, is_active, approval_status,
      submitted_for_review_at, reviewed_at, created_at,
      users!libraries_owner_id_fkey(full_name, phone),
      platform_subscriptions(status),
      seats(count)
    `)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ADMIN_LIST_PAGE_SIZE + 1) // fetch one extra to know if there's a next page

  if (filter !== 'all') {
    query = query.eq('approval_status', filter as any)
  }
  if (cursor) {
    // Cursor encodes "created_at|id" of the last row from the previous
    // page — fetch strictly older rows than that.
    const [cursorCreatedAt, cursorId] = cursor.split('|')
    query = query.or(
      `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
    )
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  const hasMore = (data ?? []).length > ADMIN_LIST_PAGE_SIZE
  const pageData = hasMore ? (data ?? []).slice(0, ADMIN_LIST_PAGE_SIZE) : (data ?? [])

  const rows: AdminLibraryRow[] = pageData.map((l: any) => {
    const owner = Array.isArray(l.users) ? l.users[0] : l.users
    const sub = Array.isArray(l.platform_subscriptions) ? l.platform_subscriptions[0] : l.platform_subscriptions
    const seats = Array.isArray(l.seats) ? l.seats[0]?.count ?? 0 : 0
    return {
      id: l.id,
      name: l.name ?? '',
      city: l.city ?? '',
      area: l.area ?? '',
      ownerId: l.owner_id,
      ownerName: owner?.full_name ?? null,
      ownerPhone: owner?.phone ?? null,
      approvalStatus: l.approval_status ?? 'pending',
      isActive: !!l.is_active,
      submittedForReviewAt: l.submitted_for_review_at,
      reviewedAt: l.reviewed_at,
      createdAt: l.created_at,
      subscriptionStatus: sub?.status ?? null,
      seatCount: seats,
    }
  })

  const last = pageData[pageData.length - 1] as any
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null

  return { success: true, data: { rows, nextCursor } }
}

/* ══════════════════════════════════════════════════════════════════════════
   GET SINGLE LIBRARY DETAIL (full onboarding snapshot for admin review)
══════════════════════════════════════════════════════════════════════════ */

export type AdminLibraryDetail = AdminLibraryRow & {
  address: string
  description: string | null
  approvalNotes: string | null
  suspendedReason: string | null
  suspendedAt: string | null
  photoUrls: string[]
  amenityNames: string[]
}

export async function getLibraryDetailForAdmin(libraryId: string): Promise<ActionResult<AdminLibraryDetail>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data: l, error } = await supabase
    .from('libraries')
    .select(`
      id, name, city, area, address, description, owner_id, is_active, approval_status,
      approval_notes, suspended_reason, suspended_at,
      submitted_for_review_at, reviewed_at, created_at,
      users!libraries_owner_id_fkey(full_name, phone),
      platform_subscriptions(status),
      library_images(image_url),
      library_amenities(amenities(name))
    `)
    .eq('id', libraryId)
    .maybeSingle()

  if (error || !l) return { success: false, error: error?.message ?? 'Library not found' }

  const seatCount = await countSeats(supabase, libraryId)

  const owner = Array.isArray((l as any).users) ? (l as any).users[0] : (l as any).users
  const sub = Array.isArray((l as any).platform_subscriptions) ? (l as any).platform_subscriptions[0] : (l as any).platform_subscriptions
  const photos = ((l as any).library_images ?? []).map((img: any) => img.image_url).filter(Boolean)
  const amenities = ((l as any).library_amenities ?? [])
    .map((la: any) => (Array.isArray(la.amenities) ? la.amenities[0]?.name : la.amenities?.name))
    .filter(Boolean)

  return {
    success: true,
    data: {
      id: l.id,
      name: l.name ?? '',
      city: l.city ?? '',
      area: l.area ?? '',
      address: l.address ?? '',
      description: (l as any).description ?? null,
      ownerId: (l as any).owner_id,
      ownerName: owner?.full_name ?? null,
      ownerPhone: owner?.phone ?? null,
      approvalStatus: (l as any).approval_status ?? 'pending',
      approvalNotes: (l as any).approval_notes ?? null,
      suspendedReason: (l as any).suspended_reason ?? null,
      suspendedAt: (l as any).suspended_at ?? null,
      isActive: !!l.is_active,
      submittedForReviewAt: (l as any).submitted_for_review_at,
      reviewedAt: (l as any).reviewed_at,
      createdAt: l.created_at ?? '',
      subscriptionStatus: sub?.status ?? null,
      seatCount: seatCount ?? 0,
      photoUrls: photos,
      amenityNames: amenities,
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   APPROVE / REJECT / SUSPEND / REACTIVATE
══════════════════════════════════════════════════════════════════════════ */

async function logAdminAction(
  supabase: any,
  adminId: string,
  actionType: string,
  entityType: string,
  entityId: string,
  notes?: string | null,
) {
  await supabase.from('admin_actions').insert({
    admin_id: adminId,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    notes: notes ?? null,
  })
}

export async function approveLibrary(libraryId: string, notes?: string): Promise<ActionResult<{ activatedNow: boolean }>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const { data: lib } = await supabase
    .from('libraries').select('id, approval_status').eq('id', libraryId).maybeSingle()
  if (!lib) return { success: false, error: 'Library not found' }

  // Approval (content/quality review) is deliberately a SEPARATE update
  // from activation (is_active) below. These used to be one atomic
  // update assuming a subscription already existed — but if the owner
  // reached go-live without completing payment, that combined update
  // would fail outright on the DB trigger
  // (enforce_library_activation_requirements), which meant admin
  // couldn't even approve the library's CONTENT while payment was
  // pending. Approval and billing are independent concerns; only the
  // final "is_active" flip should ever be gated on payment.
  const { error } = await supabase
    .from('libraries')
    .update({
      approval_status: 'approved',
      approval_notes: notes ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('id', libraryId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(supabase, user.id, 'approve_library', 'library', libraryId, notes)

  // Now attempt activation. Succeeds only if the owner already has an
  // active platform subscription (enforced by the DB trigger, not just
  // this check — this call is the normal/happy path, the trigger is the
  // backstop). If the owner hasn't paid yet, this is an EXPECTED,
  // common outcome (they reached go-live but didn't finish payment) —
  // not a real error to surface to the admin as a failure. The library
  // stays approved-but-inactive; it goes live the moment the owner
  // completes their subscription (via their own toggle, which now has a
  // working Subscribe flow — see MyLibrariesClient.tsx).
  let activatedNow = false
  const { error: activateErr } = await supabase
    .from('libraries')
    .update({ is_active: true } as never)
    .eq('id', libraryId)

  if (!activateErr) {
    activatedNow = true
  } else if (!activateErr.message.includes('SUBSCRIPTION_REQUIRED')) {
    // Some other, genuinely unexpected error on the activation step —
    // approval already succeeded, so don't fail the whole call, but do
    // surface it distinctly rather than silently swallowing it.
    logError('approveLibrary', 'Unexpected error activating after approval', activateErr)
  }

  try {
    const l = await getLibraryOwnerIdAndName(supabase, libraryId)
    if (l) {
      await supabase.rpc('notify_user', {
        p_user_id: (l as any).owner_id,
        p_event: 'library_approved',
        p_title: 'Library approved ✅',
        p_body: activatedNow
          ? `${(l as any).name} has been approved and is now live!`
          : `${(l as any).name} has been approved by the platform admin. Complete your ₹399/month subscription to go live — head to My Libraries and tap the toggle to pay.`,
        p_payload: {},
        p_library_id: libraryId,
        p_booking_id: undefined,
      })
    }
  } catch { /* notification best-effort */ }

  revalidatePath('/admin/libraries')
  revalidatePath(`/admin/libraries/${libraryId}`)
  return { success: true, data: { activatedNow } }
}

export async function rejectLibrary(libraryId: string, reason: string): Promise<ActionResult> {
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'Please provide a reason for rejection' }
  }

  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const { error } = await supabase
    .from('libraries')
    .update({
      approval_status: 'rejected',
      approval_notes: reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      is_active: false,
    } as never)
    .eq('id', libraryId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(supabase, user.id, 'reject_library', 'library', libraryId, reason)

  try {
    const l = await getLibraryOwnerIdAndName(supabase, libraryId)
    if (l) {
      await supabase.rpc('notify_user', {
        p_user_id: (l as any).owner_id,
        p_event: 'library_rejected',
        p_title: 'Library listing rejected',
        p_body: `${(l as any).name} was not approved: ${reason}. Please update your listing and resubmit.`,
        p_payload: {},
        p_library_id: libraryId,
        p_booking_id: undefined,
      })
    }
  } catch { /* best-effort */ }

  revalidatePath('/admin/libraries')
  revalidatePath(`/admin/libraries/${libraryId}`)
  return { success: true, data: undefined }
}

export async function suspendLibrary(libraryId: string, reason: string): Promise<ActionResult> {
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'Please provide a reason for suspension' }
  }

  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const { error } = await supabase
    .from('libraries')
    .update({
      approval_status: 'suspended',
      suspended_reason: reason,
      suspended_by: user.id,
      suspended_at: new Date().toISOString(),
      is_active: false,
    } as never)
    .eq('id', libraryId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(supabase, user.id, 'suspend_library', 'library', libraryId, reason)

  try {
    const l = await getLibraryOwnerIdAndName(supabase, libraryId)
    if (l) {
      await supabase.rpc('notify_user', {
        p_user_id: (l as any).owner_id,
        p_event: 'library_suspended',
        p_title: 'Library suspended ❌',
        p_body: `${(l as any).name} has been suspended: ${reason}. Contact support to resolve this.`,
        p_payload: {},
        p_library_id: libraryId,
        p_booking_id: undefined,
      })
    }
  } catch { /* best-effort */ }

  revalidatePath('/admin/libraries')
  revalidatePath(`/admin/libraries/${libraryId}`)
  return { success: true, data: undefined }
}

export async function reactivateLibrary(libraryId: string, notes?: string): Promise<ActionResult<{ activatedNow: boolean }>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase, user } = gate

  const { data: lib } = await supabase
    .from('libraries').select('id, approval_status').eq('id', libraryId).maybeSingle()
  if (!lib) return { success: false, error: 'Library not found' }
  if ((lib as any).approval_status !== 'suspended') {
    return { success: false, error: 'Only suspended libraries can be reactivated this way' }
  }

  // Same decoupling as approveLibrary — un-suspending shouldn't fail
  // outright just because the owner's subscription lapsed while
  // suspended. Un-suspend always succeeds; activation is attempted
  // separately and its expected failure (no active subscription) doesn't
  // block the un-suspend itself.
  const { error } = await supabase
    .from('libraries')
    .update({
      approval_status: 'approved',
      approval_notes: notes ?? null,
      suspended_reason: null,
      suspended_by: null,
      suspended_at: null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('id', libraryId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(supabase, user.id, 'reactivate_library', 'library', libraryId, notes)

  let activatedNow = false
  const { error: activateErr } = await supabase
    .from('libraries')
    .update({ is_active: true } as never)
    .eq('id', libraryId)

  if (!activateErr) {
    activatedNow = true
  } else if (!activateErr.message.includes('SUBSCRIPTION_REQUIRED')) {
    logError('reactivateLibrary', 'Unexpected error activating after reactivation', activateErr)
  }

  try {
    const l = await getLibraryOwnerIdAndName(supabase, libraryId)
    if (l) {
      await supabase.rpc('notify_user', {
        p_user_id: (l as any).owner_id,
        p_event: 'library_reactivated',
        p_title: 'Library reactivated ✅',
        p_body: activatedNow
          ? `${(l as any).name} has been reactivated and is live again.`
          : `${(l as any).name} has been reactivated. Complete your ₹399/month subscription to go live — head to My Libraries and tap the toggle to pay.`,
        p_payload: {},
        p_library_id: libraryId,
        p_booking_id: undefined,
      })
    }
  } catch { /* best-effort */ }

  revalidatePath('/admin/libraries')
  revalidatePath(`/admin/libraries/${libraryId}`)
  return { success: true, data: { activatedNow } }
}
