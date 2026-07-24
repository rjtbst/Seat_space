// src/components/admin/AdminPayoutsClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { resolveNoShowEscrow } from '@/lib/actions/admin-payouts'
import type { AdminPayoutRow, PendingSettlementRow, NoShowEscrowRow } from '@/lib/actions/admin-payouts'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending:    { bg: '#FEF3C7', fg: '#92400E' },
  processing: { bg: '#DBEAFE', fg: '#1E40AF' },
  completed:  { bg: '#D1FAE5', fg: '#065F46' },
  failed:     { bg: '#FEE2E2', fg: '#991B1B' },
  reversed:   { bg: '#F3E8FF', fg: '#6B21A8' },
}

function Badge({ value }: { value: string }) {
  const c = STATUS_COLORS[value] ?? { bg: '#F1F1F1', fg: '#555' }
  return <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>{value}</span>
}

function NoShowRow({ row, onResolved }: { row: NoShowEscrowRow; onResolved: () => void }) {
  const [isPending, startTransition] = useTransition()

  function resolve(resolution: 'release_to_owner' | 'flag_for_refund') {
    startTransition(async () => {
      await resolveNoShowEscrow(row.paymentId, resolution)
      onResolved()
    })
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #ECE7DC', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <p style={{ fontWeight: 700, fontSize: 13.5, margin: 0 }}>{row.libraryName} · ₹{row.amount.toFixed(2)}</p>
        <p style={{ fontSize: 12, color: '#8B95A5', margin: '3px 0 0' }}>
          {new Date(row.startTime).toLocaleString('en-IN')} – {new Date(row.endTime).toLocaleTimeString('en-IN')} · Student never checked in
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={isPending} onClick={() => resolve('release_to_owner')} style={{
          padding: '6px 12px', borderRadius: 8, border: 'none', background: '#10B981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
        }}>
          Release to owner
        </button>
        <button disabled={isPending} onClick={() => resolve('flag_for_refund')} style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid #ECE7DC', background: '#fff', color: '#6B7689', fontWeight: 600, fontSize: 12, cursor: 'pointer',
        }}>
          Go to refund
        </button>
      </div>
    </div>
  )
}

export default function AdminPayoutsClient({
  payouts, pendingSettlements, noShowEscrow, loadError,
}: {
  payouts: AdminPayoutRow[]
  pendingSettlements: PendingSettlementRow[]
  noShowEscrow: NoShowEscrowRow[]
  loadError: string | null
}) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const visibleNoShow = noShowEscrow.filter(r => !resolvedIds.has(r.paymentId))

  if (loadError) return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load payouts: {loadError}</div>

  const totalPendingEligible = pendingSettlements.reduce((s, r) => s + r.totalEligibleAmount, 0)
  const totalPendingHeld = pendingSettlements.reduce((s, r) => s + r.totalHeldAmount, 0)

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px', fontFamily: 'Syne, sans-serif' }}>Payouts & Settlements</h1>

      <div className="admin-grid-3" style={{ marginBottom: 24 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #ECE7DC' }}>
          <p style={{ fontSize: 12, color: '#8B95A5', margin: 0, fontWeight: 600 }}>Held in escrow</p>
          <p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>₹{totalPendingHeld.toFixed(2)}</p>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #ECE7DC' }}>
          <p style={{ fontSize: 12, color: '#8B95A5', margin: 0, fontWeight: 600 }}>Eligible (next sweep)</p>
          <p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: '#1E40AF' }}>₹{totalPendingEligible.toFixed(2)}</p>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #ECE7DC' }}>
          <p style={{ fontSize: 12, color: '#8B95A5', margin: 0, fontWeight: 600 }}>No-show escrow needing review</p>
          <p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: visibleNoShow.length > 0 ? '#D97706' : undefined }}>{visibleNoShow.length}</p>
        </div>
      </div>

      {visibleNoShow.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: '#92400E' }}>⚠ No-show escrow resolution needed</h3>
          {visibleNoShow.map(row => (
            <NoShowRow key={row.paymentId} row={row} onResolved={() => setResolvedIds(prev => new Set(prev).add(row.paymentId))} />
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Pending settlements by library</h3>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden', marginBottom: 28 }}>
        <div className="admin-table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Library', 'Owner', 'Held', 'Eligible (next sweep)'].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pendingSettlements.map(s => (
              <tr key={s.libraryId} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.libraryName}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{s.ownerName ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>₹{s.totalHeldAmount.toFixed(2)} ({s.bookingsHeld})</td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E40AF' }}>₹{s.totalEligibleAmount.toFixed(2)} ({s.bookingsEligible})</td>
              </tr>
            ))}
            {pendingSettlements.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No pending settlements.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Payout history</h3>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden' }}>
        <div className="admin-table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Library', 'Owner', 'Gross', 'Commission', 'Net paid', 'Method', 'Status', 'Date'].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payouts.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.libraryName ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{p.ownerName ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>₹{p.grossAmount.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', color: '#10B981' }}>₹{p.commission.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', fontWeight: 700 }}>₹{p.netAmount.toFixed(2)}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160', textTransform: 'capitalize' }}>{p.destinationType?.replace(/_/g, ' ') ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}><Badge value={p.status} /></td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No payouts yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
