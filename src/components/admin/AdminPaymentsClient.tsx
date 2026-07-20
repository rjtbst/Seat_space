// src/components/admin/AdminPaymentsClient.tsx
'use client'

import { useState, useMemo, useTransition } from 'react'
import { initiateRefund, listPaymentsForAdmin } from '@/lib/actions/admin-refunds'
import type { AdminPaymentRow } from '@/lib/actions/admin-refunds'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending:             { bg: '#FEF3C7', fg: '#92400E' },
  paid:                { bg: '#D1FAE5', fg: '#065F46' },
  failed:              { bg: '#FEE2E2', fg: '#991B1B' },
  refunded:            { bg: '#E0E7FF', fg: '#3730A3' },
  partially_refunded:  { bg: '#FEF3C7', fg: '#92400E' },
}

const ESCROW_COLORS: Record<string, { bg: string; fg: string }> = {
  held:           { bg: '#FEF3C7', fg: '#92400E' },
  eligible:       { bg: '#DBEAFE', fg: '#1E40AF' },
  paid_out:       { bg: '#D1FAE5', fg: '#065F46' },
  refunded:       { bg: '#E0E7FF', fg: '#3730A3' },
  cancelled:      { bg: '#FEE2E2', fg: '#991B1B' },
  not_applicable: { bg: '#F1F1F1', fg: '#6B7689' },
}

function Badge({ value, colorMap }: { value: string; colorMap: Record<string, { bg: string; fg: string }> }) {
  const c = colorMap[value] ?? { bg: '#F1F1F1', fg: '#555' }
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function RefundModal({ payment, onClose, onDone }: { payment: AdminPaymentRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(payment.amount.toFixed(2))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    if (!reason.trim() || reason.trim().length < 3) { setError('Please provide a reason'); return }

    startTransition(async () => {
      const res = await initiateRefund({ paymentId: payment.id, amount: amt, reason: reason.trim(), notes: notes.trim() || undefined })
      if (!res.success) setError(res.error)
      else onDone()
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Initiate refund</h3>
        <p style={{ fontSize: 12.5, color: '#8B95A5', margin: '0 0 16px' }}>
          {payment.studentName ?? 'Student'} · {payment.libraryName ?? 'Booking'} · Original: ₹{payment.amount.toFixed(2)}
        </p>

        {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <label style={{ fontSize: 12, fontWeight: 600, color: '#4B5160' }}>Refund amount (₹)</label>
        <input
          type="number" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 14, margin: '6px 0 12px' }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#4B5160' }}>Reason (shown to student & owner)</label>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Library was closed during booked slot"
          style={{ width: '100%', minHeight: 60, padding: '9px 12px', borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 13.5, margin: '6px 0 12px', fontFamily: 'inherit' }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#4B5160' }}>Internal notes (optional)</label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: '100%', minHeight: 50, padding: '9px 12px', borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 13.5, margin: '6px 0 16px', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={isPending} onClick={submit} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
          }}>
            {isPending ? 'Processing…' : 'Confirm refund'}
          </button>
          <button onClick={onClose} disabled={isPending} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #ECE7DC', background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPaymentsClient({
  payments: initialPayments, initialCursor, loadError,
}: { payments: AdminPaymentRow[]; initialCursor: string | null; loadError: string | null }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [refundTarget, setRefundTarget] = useState<AdminPaymentRow | null>(null)
  const [justRefunded, setJustRefunded] = useState<string | null>(null)
  const [payments, setPayments] = useState(initialPayments)
  const [cursor, setCursor] = useState(initialCursor)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(loadError)

  // Status filter is applied server-side now (the client only ever holds
  // loaded pages, not the full table) — re-fetch page 1 on change.
  function applyStatusFilter(next: string) {
    setStatusFilter(next)
    setError(null)
    startTransition(async () => {
      const res = await listPaymentsForAdmin(next === 'all' ? {} : { status: next }, null)
      if (!res.success) { setError(res.error); return }
      setPayments(res.data.rows)
      setCursor(res.data.nextCursor)
    })
  }

  function loadMore() {
    if (!cursor) return
    startTransition(async () => {
      const res = await listPaymentsForAdmin(statusFilter === 'all' ? {} : { status: statusFilter }, cursor)
      if (!res.success) { setError(res.error); return }
      setPayments(prev => [...prev, ...res.data.rows])
      setCursor(res.data.nextCursor)
    })
  }

  // Search filters within currently loaded pages (same tradeoff as the
  // libraries/refunds admin lists — see AdminLibrariesClient comment).
  const filtered = useMemo(() => payments.filter(p => {
    if (search && !p.studentName?.toLowerCase().includes(search.toLowerCase()) && !p.libraryName?.toLowerCase().includes(search.toLowerCase()) && !p.razorpayPaymentId?.includes(search)) return false
    return true
  }), [payments, search])

  if (error) return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load payments: {error}</div>

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px', fontFamily: 'Syne, sans-serif' }}>Payments</h1>

      {justRefunded && (
        <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13.5 }}>
          Refund initiated for payment {justRefunded}. Refresh to see updated status.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={statusFilter} onChange={e => applyStatusFilter(e.target.value)} disabled={isPending} style={{
          padding: '8px 12px', borderRadius: 10, border: '1px solid #ECE7DC', fontSize: 13,
        }}>
          {['all', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'].map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input
          placeholder="Search by student, library, or Razorpay payment ID…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid #ECE7DC', fontSize: 13 }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Student', 'Library', 'Amount', 'Status', 'Escrow', 'Razorpay ID', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.studentName ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{p.libraryName ?? '—'}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{p.amount.toFixed(2)}</td>
                <td style={{ padding: '12px 16px' }}><Badge value={p.status} colorMap={STATUS_COLORS} /></td>
                <td style={{ padding: '12px 16px' }}><Badge value={p.escrowStatus} colorMap={ESCROW_COLORS} /></td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 11.5, fontFamily: 'monospace' }}>{p.razorpayPaymentId ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString('en-IN')}</td>
                <td style={{ padding: '12px 16px' }}>
                  {['paid', 'partially_refunded'].includes(p.status) && (
                    <button onClick={() => setRefundTarget(p)} style={{
                      background: 'none', border: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                    }}>
                      Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No payments match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {cursor && !search && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={loadMore} disabled={isPending} style={{
            padding: '9px 20px', borderRadius: 10, border: '1px solid #ECE7DC', background: '#fff',
            color: '#7C3AED', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1,
          }}>
            {isPending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {refundTarget && (
        <RefundModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onDone={() => { setJustRefunded(refundTarget.id); setRefundTarget(null) }}
        />
      )}
    </div>
  )
}
