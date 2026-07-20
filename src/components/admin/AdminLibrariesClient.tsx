// src/components/admin/AdminLibrariesClient.tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import {
  listLibrariesForAdmin, getLibraryStatusCounts,
} from '@/lib/actions/admin-libraries'
import type { AdminLibraryRow, LibraryStatusCounts } from '@/lib/actions/admin-libraries'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending:   { bg: '#FEF3C7', fg: '#92400E' },
  approved:  { bg: '#D1FAE5', fg: '#065F46' },
  rejected:  { bg: '#FEE2E2', fg: '#991B1B' },
  suspended: { bg: '#F3E8FF', fg: '#6B21A8' },
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: '#F1F1F1', fg: '#555' }
  return (
    <span style={{
      background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700,
      padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  )
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'suspended'

export default function AdminLibrariesClient({
  libraries: initialLibraries, initialCursor, loadError,
}: { libraries: AdminLibraryRow[]; initialCursor: string | null; loadError: string | null }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [libraries, setLibraries] = useState(initialLibraries)
  const [cursor, setCursor] = useState(initialCursor)
  const [counts, setCounts] = useState<LibraryStatusCounts | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(loadError)

  useEffect(() => {
    getLibraryStatusCounts().then(res => { if (res.success) setCounts(res.data) })
  }, [])

  // Re-fetch page 1 whenever the filter changes (server-side filtering —
  // the client only ever holds ONE page's worth of rows at a time, so
  // filtering can no longer be done in-memory against a full dataset).
  function applyFilter(next: Filter) {
    setFilter(next)
    setError(null)
    startTransition(async () => {
      const res = await listLibrariesForAdmin(next, null)
      if (!res.success) { setError(res.error); return }
      setLibraries(res.data.rows)
      setCursor(res.data.nextCursor)
    })
  }

  function loadMore() {
    if (!cursor) return
    startTransition(async () => {
      const res = await listLibrariesForAdmin(filter, cursor)
      if (!res.success) { setError(res.error); return }
      setLibraries(prev => [...prev, ...res.data.rows])
      setCursor(res.data.nextCursor)
    })
  }

  // Search is client-side WITHIN the currently loaded pages — intentional
  // tradeoff: a true server-side search across the full table would need
  // its own query path (full-text or ilike with its own pagination). This
  // keeps the common case ("find the library I just approved, still on
  // this page") instant, while "load more" still works normally for
  // browsing beyond what search has filtered.
  const visible = search
    ? libraries.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.ownerName?.toLowerCase().includes(search.toLowerCase()))
    : libraries

  if (error) return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load libraries: {error}</div>

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px', fontFamily: 'Syne, sans-serif' }}>Libraries</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'approved', 'rejected', 'suspended'] as const).map(f => (
          <button key={f} onClick={() => applyFilter(f)} disabled={isPending} style={{
            padding: '7px 14px', borderRadius: 10, border: '1px solid #ECE7DC', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
            background: filter === f ? '#7C3AED' : '#fff',
            color: filter === f ? '#fff' : '#4B5160',
            opacity: isPending ? 0.6 : 1,
          }}>
            {f} {counts ? `(${counts[f]})` : ''}
          </button>
        ))}
        <input
          placeholder="Search loaded rows by name or owner…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '7px 14px', borderRadius: 10, border: '1px solid #ECE7DC',
            fontSize: 13, width: 260,
          }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ECE7DC', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAF8F4', textAlign: 'left' }}>
              {['Library', 'Owner', 'Location', 'Status', 'Subscription', 'Seats', 'Submitted', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#6B7689', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(lib => (
              <tr key={lib.id} style={{ borderTop: '1px solid #F3F1EC' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{lib.name}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{lib.ownerName ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{lib.area}, {lib.city}</td>
                <td style={{ padding: '12px 16px' }}><StatusBadge status={lib.approvalStatus} /></td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{lib.subscriptionStatus ?? 'None'}</td>
                <td style={{ padding: '12px 16px', color: '#4B5160' }}>{lib.seatCount}</td>
                <td style={{ padding: '12px 16px', color: '#A6AEBA', fontSize: 12 }}>
                  {lib.submittedForReviewAt ? new Date(lib.submittedForReviewAt).toLocaleDateString('en-IN') : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Link href={`/admin/libraries/${lib.id}`} style={{ color: '#7C3AED', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#A6AEBA' }}>No libraries match this filter.</td></tr>
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
    </div>
  )
}
