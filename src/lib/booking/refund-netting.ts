// src/lib/booking/refund-netting.ts
/**
 * Single source of truth for recomputing a payment's status and
 * owner/platform split from its CURRENT set of non-failed refunds.
 *
 * WHY THIS EXISTS: a refund can be reversed after the fact — Razorpay's
 * refund.processed/refund.failed webhooks arrive asynchronously, seconds
 * to minutes after an admin initiates a refund. If a refund that
 * initiateRefund() (admin-refunds.ts) optimistically applied later FAILS
 * on Razorpay's side (bank/UPI rejection), the payment must be reverted
 * back to what it should be as if that refund never happened — otherwise
 * the owner stays shorted for money that was never actually taken from
 * the student, which is exactly the kind of silent, hard-to-audit
 * discrepancy that causes disputes.
 *
 * Called from:
 *  - admin-refunds.ts, right after a new refund is created (moves the
 *    split DOWN to reflect the new refund)
 *  - app/api/payment/razorpay-webhook/route.ts, on refund.failed (moves
 *    the split back UP, since that refund's amount now no longer counts)
 *
 * Both call sites end up at the exact same numbers for the exact same
 * input (payment.amount, payment.base_amount, and the current set of
 * non-failed refunds against it) — there is no separate math anywhere
 * else that could drift from this.
 */

export type RefundNettingResult = {
  status: 'paid' | 'partially_refunded' | 'refunded'
  ownerPayoutAmount: number | null
  commissionAmount: number | null
  isFullyRefunded: boolean
  hasAnyRefund: boolean
}

/**
 * Recomputes and PERSISTS payments.status / owner_payout_amount /
 * platform_commission_amount / escrow_status from scratch, based on the
 * payment's original amount/base_amount and the current sum of its
 * non-failed refunds (pending + processing + completed).
 *
 * Idempotent — safe to call multiple times for the same state (e.g. a
 * retried webhook delivery), since it always recomputes from the full set
 * of current refund rows rather than incrementally adjusting.
 *
 * Escrow is only closed out to 'refunded' on a FULL refund, and only if
 * it was still held/eligible (not already paid_out — that case is
 * tracked via the separate payout_clawbacks ledger instead). A partial
 * refund — or a refund that's since failed and brought the payment back
 * to fully-paid — leaves escrow_status untouched so the ordinary payout
 * sweep keeps working correctly either way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputePaymentAfterRefunds(supabase: any, paymentId: string): Promise<RefundNettingResult | null> {
  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select('id, amount, base_amount, escrow_status')
    .eq('id', paymentId)
    .maybeSingle()

  if (paymentErr || !payment) return null

  const originalAmount = Number((payment as any).amount)
  const baseAmount = (payment as any).base_amount != null ? Number((payment as any).base_amount) : null

  const { data: refundRows } = await supabase
    .from('refunds')
    .select('amount')
    .eq('payment_id', paymentId)
    .in('status', ['pending', 'processing', 'completed'])

  const totalRefunded = Math.min(
    originalAmount,
    ((refundRows ?? []) as any[]).reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
  )
  const remainingGross  = originalAmount - totalRefunded
  const isFullyRefunded = remainingGross <= 0.01
  const hasAnyRefund    = totalRefunded > 0.01

  // Fee-on-top payments only: owner's remaining payout is proportional to
  // what's NOT been refunded; whatever's left of the gross after that is
  // the platform's remaining commission — the platform absorbs its own
  // commission on any refunded portion rather than clawing that back from
  // the owner.
  const ownerPayoutAmount = baseAmount != null
    ? Math.round(baseAmount * (remainingGross / originalAmount))
    : null
  const commissionAmount = baseAmount != null
    ? remainingGross - (ownerPayoutAmount as number)
    : null

  const status: RefundNettingResult['status'] = isFullyRefunded ? 'refunded' : hasAnyRefund ? 'partially_refunded' : 'paid'

  await supabase
    .from('payments')
    .update({
      status,
      owner_payout_amount:        ownerPayoutAmount,
      platform_commission_amount: commissionAmount,
      escrow_status: isFullyRefunded && ((payment as any).escrow_status === 'eligible' || (payment as any).escrow_status === 'held')
        ? 'refunded'
        : (payment as any).escrow_status,
    } as never)
    .eq('id', paymentId)

  return { status, ownerPayoutAmount, commissionAmount, isFullyRefunded, hasAnyRefund }
}
