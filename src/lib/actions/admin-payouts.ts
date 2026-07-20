// lib/actions/admin-payouts.ts
'use server'

/**
 * Admin payout history + pending settlements + settlement reports.
 * Reads payouts table and the settlement_summary view (defined in the
 * escrow migration).
 */

import { requireActionRole } from '@/lib/auth/guards'

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

export type AdminPayoutRow = {
  id: string
  bookingId: string | null
  libraryName: string | null
  ownerName: string | null
  status: string
  grossAmount: number
  commission: number
  netAmount: number
  destinationType: string | null
  razorpayPayoutId: string | null
  failureReason: string | null
  createdAt: string
  processedAt: string | null
}

export async function listPayoutsForAdmin(
  filter: { status?: string } = {},
): Promise<ActionResult<AdminPayoutRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  let query = supabase
    .from('payouts')
    .select(`
      id, booking_id, status, gross_amount_paise, commission_paise, net_amount_paise,
      destination_type, razorpay_payout_id, failure_reason, created_at, processed_at,
      libraries(name),
      users!payouts_owner_id_fkey(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter.status) query = query.eq('status', filter.status as any)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  const rows: AdminPayoutRow[] = (data ?? []).map((p: any) => {
    const library = Array.isArray(p.libraries) ? p.libraries[0] : p.libraries
    const owner = Array.isArray(p.users) ? p.users[0] : p.users
    return {
      id: p.id,
      bookingId: p.booking_id,
      libraryName: library?.name ?? null,
      ownerName: owner?.full_name ?? null,
      status: p.status,
      grossAmount: (p.gross_amount_paise ?? 0) / 100,
      commission: (p.commission_paise ?? 0) / 100,
      netAmount: (p.net_amount_paise ?? 0) / 100,
      destinationType: p.destination_type,
      razorpayPayoutId: p.razorpay_payout_id,
      failureReason: p.failure_reason,
      createdAt: p.created_at,
      processedAt: p.processed_at,
    }
  })

  return { success: true, data: rows }
}

export type PendingSettlementRow = {
  libraryId: string
  libraryName: string
  ownerName: string | null
  bookingsHeld: number
  bookingsEligible: number
  totalHeldAmount: number
  totalEligibleAmount: number
}

export async function getPendingSettlements(): Promise<ActionResult<PendingSettlementRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('payments')
    .select('amount, owner_payout_amount, escrow_status, bookings(library_id, libraries(name, owner_id, users!libraries_owner_id_fkey(full_name)))')
    .in('escrow_status', ['held', 'eligible'])
    .not('booking_id', 'is', null)

  if (error) return { success: false, error: error.message }

  const byLibrary = new Map<string, PendingSettlementRow>()

  for (const p of data ?? []) {
    const booking = Array.isArray((p as any).bookings) ? (p as any).bookings[0] : (p as any).bookings
    const library = booking ? (Array.isArray(booking.libraries) ? booking.libraries[0] : booking.libraries) : null
    if (!library) continue
    const owner = Array.isArray(library.users) ? library.users[0] : library.users

    const libId = booking.library_id
    const existing = byLibrary.get(libId) ?? {
      libraryId: libId,
      libraryName: library.name ?? '',
      ownerName: owner?.full_name ?? null,
      bookingsHeld: 0,
      bookingsEligible: 0,
      totalHeldAmount: 0,
      totalEligibleAmount: 0,
    }

    // What the owner will actually be paid, not the gross the student paid
    // (which includes the platform fee) — see revenue.ts for the same fix.
    const amount = Number((p as any).owner_payout_amount ?? (p as any).amount ?? 0)
    if ((p as any).escrow_status === 'held') {
      existing.bookingsHeld++
      existing.totalHeldAmount += amount
    } else {
      existing.bookingsEligible++
      existing.totalEligibleAmount += amount
    }

    byLibrary.set(libId, existing)
  }

  return { success: true, data: Array.from(byLibrary.values()).sort((a, b) => b.totalEligibleAmount - a.totalEligibleAmount) }
}

export type SettlementSummaryRow = {
  libraryId: string
  libraryName: string
  settlementDate: string
  bookingsHeld: number
  bookingsEligible: number
  bookingsPaidOut: number
  grossSettled: number
  commissionSettled: number
  netSettled: number
}

export async function getSettlementReport(
  libraryId?: string,
): Promise<ActionResult<SettlementSummaryRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  let query = supabase
    .from('settlement_summary')
    .select('*')
    .order('settlement_date', { ascending: false })
    .limit(365)

  if (libraryId) query = query.eq('library_id', libraryId)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      libraryId: r.library_id,
      libraryName: r.library_name ?? '',
      settlementDate: r.settlement_date,
      bookingsHeld: r.bookings_held ?? 0,
      bookingsEligible: r.bookings_eligible ?? 0,
      bookingsPaidOut: r.bookings_paid_out ?? 0,
      grossSettled: Number(r.gross_settled ?? 0),
      commissionSettled: Number(r.commission_settled ?? 0),
      netSettled: Number(r.net_settled ?? 0),
    })),
  }
}

/** No-show bookings whose escrow needs manual admin resolution (see
 * pending_no_show_escrow view, created in the booking-lifecycle migration). */
export type NoShowEscrowRow = {
  bookingId: string
  libraryName: string
  studentId: string
  startTime: string
  endTime: string
  paymentId: string
  amount: number
}

export async function getPendingNoShowEscrow(): Promise<ActionResult<NoShowEscrowRow[]>> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  const { data, error } = await supabase
    .from('pending_no_show_escrow')
    .select('*')
    .order('start_time', { ascending: false })
    .limit(200)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      bookingId: r.booking_id,
      libraryName: r.library_name ?? '',
      studentId: r.student_id,
      startTime: r.start_time,
      endTime: r.end_time,
      paymentId: r.payment_id,
      amount: Number(r.amount ?? 0),
    })),
  }
}

/** Admin manually resolves a no-show: either release to owner (mark
 * eligible) or refund the student via the standard refund flow. */
export async function resolveNoShowEscrow(
  paymentId: string,
  resolution: 'release_to_owner' | 'flag_for_refund',
): Promise<ActionResult> {
  const gate = await requireActionRole('admin')
  if (!gate.ok) return gate.error
  const { supabase } = gate

  if (resolution === 'release_to_owner') {
    const { error } = await supabase
      .from('payments')
      .update({ escrow_status: 'eligible', escrow_eligible_at: new Date().toISOString() } as never)
      .eq('id', paymentId)
      .eq('escrow_status', 'held')
    if (error) return { success: false, error: error.message }
    return { success: true, data: undefined }
  }

  // flag_for_refund: just leave escrow as-is and let admin use the normal
  // initiateRefund flow against this payment from the payments table —
  // this function only exists to make the no-show queue actionable without
  // forcing a separate navigation for the common "release" case.
  return { success: true, data: undefined }
}