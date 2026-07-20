'use server'

// src/lib/actions/owner/payouts.ts
//
// Owner visibility into their own payout runs — "when does my money
// actually land". Nothing in the codebase exposed this to the owner before
// (the `payouts` table was only ever read from admin/cron/webhook code —
// see admin-payouts.ts, api/cron/run-payouts, api/payment/payout-webhook).
// This is a new, minimal, read-only, owner_id-scoped query, not a rewrite
// of anything — added specifically so the chat assistant (and, later, a
// payouts tab on /dashboard/billing if wanted) has something real to read
// instead of guessing.

import { getSupabaseUser } from '@/lib/supabase/server'
import { logError } from '@/lib/logger'

export type OwnerPayout = {
  id: string
  libraryId: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'reversed'
  netAmount: number
  grossAmount: number
  commission: number
  destinationType: 'bank_account' | 'vpa' | null
  utr: string | null
  failureReason: string | null
  processedAt: string | null
  createdAt: string
}

/** The current owner's own payout runs, most recent first. RLS-independent scoping via owner_id = auth.uid(). */
export async function getMyPayouts(limit = 20): Promise<OwnerPayout[]> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('payouts')
    .select(
      'id, library_id, status, net_amount_paise, gross_amount_paise, commission_paise, destination_type, utr, failure_reason, processed_at, created_at',
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    logError('getMyPayouts', 'Fetch failed', error)
    return []
  }

  return (data ?? []).map((p: any): OwnerPayout => ({
    id: p.id,
    libraryId: p.library_id,
    status: p.status,
    netAmount: Number(p.net_amount_paise ?? 0) / 100,
    grossAmount: Number(p.gross_amount_paise ?? 0) / 100,
    commission: Number(p.commission_paise ?? 0) / 100,
    destinationType: p.destination_type,
    utr: p.utr,
    failureReason: p.failure_reason,
    processedAt: p.processed_at,
    createdAt: p.created_at,
  }))
}
