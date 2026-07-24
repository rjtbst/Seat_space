// src/components/admin/AdminRefundsClient.tsx
'use client'

import { useState, useMemo, useTransition } from 'react'
import { approveSystemRefund, rejectSystemRefund, listRefundsForAdmin } from '@/lib/actions/admin-refunds'
import type { AdminRefundRow } from '@/lib/actions/admin-refunds'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending:    { bg: '#FEF3C7', fg: '#92400E' },
  processing: { bg: '#DBEAFE', fg: '#1E40AF' },
  completed:  { bg: '#D1FAE5', fg: '#065F46' },
  failed:     { bg: '#FEE2E2', fg: '#991B1B' },
}

function Badge({ value }: { value: string }) {
  const c = STATUS_COLORS[value] ?? { bg: '#F1F1F1', fg: '#555' }
  return <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>{value}</span>
}

function PendingRow({ refund, onResolved }: { refund: AdminRefundRow; onResolved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function approve() {
    setError(null)
    startTransition(async () => {
      const res = await approveSystemRefund(refund.id)
      if (!res.success) setError(res.error)
      else onResolved()
    })
  }

  function reject() {
    setError(null)
    if (!rejectNotes.trim()) { setError('Please provide a reason'); return }
    startTransition(async () => {
      const res = await rejectSystemRefund(refund.id, rejectNotes)
      if (!res.success) setError(res.error)
      else onResolved()
    })
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #FDE68A', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{refund.studentName ?? 'Student'} · {refund.libraryName ?? 'Booking'}</p>
          <p style={{ fontSize: 12.5, color: '#8B95A5', margin: '4px 0 0' }}>{refund.reason}</p>
          <p style={{ fontSize: 12, color: '#A6AEBA', margin: '4px 0 0' }}>
            ₹{refund.amount.toFixed(2)} of ₹{refund.originalAmount.toFixed(2)} · {new Date(refund.createdAt).toLocaleDateString('en-IN')}
          </p>
        </div>
        <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>System-flagged</span>
      </div>

      {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '6px 10px', borderRadius: 8, fontSize: 12, margin: '8px 0' }}>{error}</div>}

      {!showRejectForm ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button disabled={isPending} onClick={approve} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', background: '#10B981', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
          }}>
            ✓ Approve & process refund
          </button>
          <button onClick={() => setShowRejectForm(true)} style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
          }}>
            ✕ Reject
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea
            placeholder="Reason for rejecting this refund request…"
            value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
            style={{ width: '100%', minHeight: 50, padding: 8, borderRadius: 8, border: '1px solid #ECE7DC', fontSize: 12.5, marginBottom: 8, fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={isPending} onClick={reject} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            }}>Confirm reject</button>
            <button onClick={() => setShowRejectForm(false)} style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid #ECE7DC', background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminRefundsClient({
  refunds: initialRefunds, initialCursor, loadError,
}: { refunds: AdminRefundRow[]; initialCursor: string | null; loadError: string | null }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [refunds, setRefunds] = useState(initialRefunds)
  const [cursor, setCursor] = useState(initialCursor)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(loadError)

  function loadMore() {
    if (!cursor) return
    startTransition(async () => {
      const res = await listRefundsForAdmin({}, cursor)
      if (!res.success) { setError(res.error); return }
      setRefunds(prev => [...prev, ...res.data.rows])
      setCursor(res.data.nextCursor)
    })
  }

  const pendingSystemRequests = useMemo(
    () => refunds.filter(r => r.status === 'pending' && r.isSystemRaised && !resolvedIds.has(r.id)),
    [refunds, resolvedIds],
  )
  const history = useMemo(
    () => refunds.filter(r => !(r.status === 'pending' && r.isSystemRaised)),
    [refunds],
  )

  if (error) return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load refunds: {error}</div>

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px', fontFamily: 'Syne, sans-serif' }}>Refunds</h1>

      {pendingSystemRequests.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: '#92400E' }}>
            ⚠ Pending review ({pendingSystemRequests.length})
          </h3>
          <p style={{ fontSize: 12.5, color: '#8B95A5', margin: '0 0 12px' }}>
            These were auto-flagged when a student cancelled an already-paid booking. Review and approve or reject.
          </p>
          {pendingSystemRequests.map(r => (
            <PendingRow key={r.id} refund={r} onResolved={() => setResolvedIds(prev => new Set(prev).add(r.id))} />
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Refund history</h3>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden' }}>
        <div className="admin-table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Student', 'Library', 'Amount', 'Type', 'Status', 'Reason', 'Date'].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.studentName ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{r.libraryName ?? '—'}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{r.amount.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160', textTransform: 'capitalize' }}>{r.refundType}</td>
                <td style={{ padding: '12px 16px' }}><Badge value={r.status} /></td>
                <td style={{ padding: '12px 16px', color: '#8B95A5', fontSize: 12.5, maxWidth: 240 }}>{r.reason}</td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No refund history yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {cursor && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={loadMore} disabled={isPending} style={{
            padding: '9px 20px', borderRadius: 10, border: '1px solid #ECE7DC', background: '#fff',
            color: '#7C3AED', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: isPending ? 0.6 : 1,
          }}>
            {isPending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
