// src/components/admin/AdminSubscriptionsClient.tsx
'use client'

import { useState, useMemo } from 'react'
import type { AdminSubscriptionRow } from '@/lib/actions/admin-subscriptions'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  created:   { bg: '#F1F1F1', fg: '#555' },
  pending:   { bg: '#FEF3C7', fg: '#92400E' },
  active:    { bg: '#D1FAE5', fg: '#065F46' },
  past_due:  { bg: '#FEE2E2', fg: '#991B1B' },
  halted:    { bg: '#FEE2E2', fg: '#991B1B' },
  cancelled: { bg: '#F3E8FF', fg: '#6B21A8' },
  expired:   { bg: '#F3E8FF', fg: '#6B21A8' },
}

function Badge({ value }: { value: string }) {
  const c = STATUS_COLORS[value] ?? { bg: '#F1F1F1', fg: '#555' }
  return <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>{value.replace(/_/g, ' ')}</span>
}

export default function AdminSubscriptionsClient({ subscriptions, loadError }: { subscriptions: AdminSubscriptionRow[]; loadError: string | null }) {
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = useMemo(
    () => subscriptions.filter(s => statusFilter === 'all' || s.status === statusFilter),
    [subscriptions, statusFilter],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: subscriptions.length }
    for (const s of subscriptions) c[s.status] = (c[s.status] ?? 0) + 1
    return c
  }, [subscriptions])

  if (loadError) return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load subscriptions: {loadError}</div>

  const statuses = ['all', 'active', 'past_due', 'halted', 'pending', 'cancelled', 'expired']

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px', fontFamily: 'Syne, sans-serif' }}>Platform Subscriptions</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '7px 14px', borderRadius: 10, border: '1px solid #ECE7DC', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize',
            background: statusFilter === s ? '#7C3AED' : '#fff',
            color: statusFilter === s ? '#fff' : '#4B5160',
          }}>
            {s.replace(/_/g, ' ')} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Library', 'Owner', 'Status', 'Amount', 'Next billing', 'Grace ends', 'Failed charges'].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.libraryName}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{s.ownerName ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}><Badge value={s.status} /></td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>₹{s.amountRupees.toFixed(2)}/mo</td>
                <td style={{ padding: '12px 16px', color: '#4B5160', fontSize: 12.5 }}>
                  {s.nextBillingAt ? new Date(s.nextBillingAt).toLocaleDateString('en-IN') : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: s.gracePeriodEndsAt ? '#D97706' : '#A6AEBA', fontSize: 12.5 }}>
                  {s.gracePeriodEndsAt ? new Date(s.gracePeriodEndsAt).toLocaleDateString('en-IN') : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: s.failedChargeCount > 0 ? '#DC2626' : '#A6AEBA' }}>{s.failedChargeCount}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No subscriptions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
