'use client'

// src/app/(staff)/staff/books/_components/RequestsTab.tsx
import { useState } from 'react'
import type { BookRequest, CatalogBook, BookIssue } from '@/lib/actions/staff-book-action'
import { approveBookRequest, rejectBookRequest } from '@/lib/actions/staff-book-action'
import { ACCENT } from '@/lib/constants/theme'

type Props = {
  libraryId:  string
  requests:   BookRequest[]
  catalog:    CatalogBook[]
  onApproved: (requestId: string, newIssue: BookIssue, updatedCatalog: CatalogBook[]) => void
  onRejected: (requestId: string) => void
}

function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

export default function RequestsTab({ libraryId, requests, catalog, onApproved, onRejected }: Props) {
  // Per-request due-date state
  const [dueDates, setDueDates]     = useState<Record<string, string>>({})
  const [loading,  setLoading]      = useState<string | null>(null)
  const [error,    setError]        = useState<string | null>(null)
  const [expanded, setExpanded]     = useState<string | null>(null)

  const getDueDate = (id: string) => dueDates[id] ?? defaultDueDate()

  const handleApprove = async (req: BookRequest) => {
    setLoading(req.requestId)
    setError(null)
    const due = getDueDate(req.requestId)
    const res = await approveBookRequest(req.requestId, libraryId, due)
    setLoading(null)
    if (res.success === false) return setError(res.error ?? 'Failed to approve')

    // Build optimistic BookIssue
    const now = new Date().toISOString()
    const book = catalog.find(b => b.bookId === req.bookId)
    const copy = book?.copies.find(c => c.status === 'available')

    const newIssue: BookIssue = {
      issueId:     res.data!.issueId,
      bookId:      req.bookId,
      copyId:      copy?.copyId ?? '',
      title:       req.title,
      author:      req.author,
      issuedTo:    req.userName,
      phone:       req.userPhone,
      isGuest:     false,
      userId:      req.userId,
      issuedAt:    now,
      dueDate:     due,
      isOverdue:   false,
      daysOverdue: 0,
    }

    const updatedCatalog = catalog.map(b =>
      b.bookId === req.bookId && copy
        ? {
            ...b,
            availableCopies: b.availableCopies - 1,
            issuedCopies:    b.issuedCopies + 1,
            copies: b.copies.map(c =>
              c.copyId === copy.copyId ? { ...c, status: 'issued' as const } : c
            ),
          }
        : b
    )

    onApproved(req.requestId, newIssue, updatedCatalog)
  }

  const handleReject = async (req: BookRequest) => {
    setLoading(req.requestId + '_reject')
    setError(null)
    const res = await rejectBookRequest(req.requestId, libraryId)
    setLoading(null)
    if (res.success === false) return setError(res.error ?? 'Failed to reject')
    onRejected(req.requestId)
  }

  const pending  = requests.filter(r => r.status === 'pending')
  const reviewed = requests.filter(r => r.status !== 'pending')

  if (requests.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#9AAAB8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
        <div style={{ fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>No requests yet</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div className="clay-raised-sm" style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', fontFamily: 'DM Sans, sans-serif' }}>
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div style={sectionHeader}>
            Pending
            <span className="dash-badge" style={{ color: ACCENT, background: 'var(--clay-surface)' }}>
              {pending.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(req => {
              const book       = catalog.find(b => b.bookId === req.bookId)
              const hasAvail   = (book?.availableCopies ?? 0) > 0
              const isLoading  = loading === req.requestId
              const isRejecting = loading === req.requestId + '_reject'
              const isOpen     = expanded === req.requestId

              return (
                <div key={req.requestId} className="clay-raised" style={{
                  overflow:     'hidden',
                }}>
                  {/* Header row */}
                  <button className="clay-interactive"
                    onClick={() => setExpanded(isOpen ? null : req.requestId)}
                    style={{
                      width:       '100%',
                      display:     'flex',
                      justifyContent: 'space-between',
                      alignItems:  'center',
                      padding:     '12px 14px',
                      background:  'transparent',
                      border:      'none',
                      cursor:      'pointer',
                      textAlign:   'left',
                      gap:         8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {req.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 2, fontFamily: 'DM Sans, sans-serif' }}>
                        {req.userName}{req.userPhone ? ` · ${req.userPhone}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span className="dash-badge" style={{
                        background: hasAvail ? '#ECFDF5' : '#FEF2F2',
                        color:      hasAvail ? '#059669' : '#DC2626',
                      }}>
                        {hasAvail ? `${book!.availableCopies} avail` : 'none avail'}
                      </span>
                      <span style={{ color: '#9AAAB8', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded: due date + actions */}
                  {isOpen && (
                    <div style={{ padding: '0 14px 14px', boxShadow: 'inset 0 1px 0 rgba(163,177,198,.2)' }}>
                      {req.message && (
                        <div style={{ fontSize: 12, color: '#6B7689', fontFamily: 'DM Sans, sans-serif', marginBottom: 10, marginTop: 10, fontStyle: 'italic' }}>
                          "{req.message}"
                        </div>
                      )}
                      <div style={{ marginTop: req.message ? 0 : 10, marginBottom: 12 }}>
                        <label style={labelStyle}>Due Date</label>
                        <input
                          type="date"
                          value={getDueDate(req.requestId)}
                          onChange={e => setDueDates(prev => ({ ...prev, [req.requestId]: e.target.value }))}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="clay-btn-primary"
                          onClick={() => handleApprove(req)}
                          disabled={isLoading || isRejecting || !hasAvail}
                          style={{
                            flex:         1,
                            background:   `linear-gradient(155deg, #22D9EA, ${ACCENT}, #05707D)`,
                            border:       'none',
                            padding:      '9px 0',
                            fontSize:     12,
                            fontWeight:   700,
                            cursor:       isLoading || !hasAvail ? 'default' : 'pointer',
                            fontFamily:   'DM Sans, sans-serif',
                            opacity:      !hasAvail ? 0.4 : 1,
                          }}
                        >
                          {isLoading ? '…' : '✓ Approve'}
                        </button>
                        <button className="clay-raised-sm clay-interactive"
                          onClick={() => handleReject(req)}
                          disabled={isLoading || isRejecting}
                          style={{
                            flex:         1,
                            background:   'transparent',
                            color:        '#DC2626',
                            border:       'none',
                            padding:      '9px 0',
                            fontSize:     12,
                            fontWeight:   700,
                            cursor:       isRejecting ? 'default' : 'pointer',
                            fontFamily:   'DM Sans, sans-serif',
                          }}
                        >
                          {isRejecting ? '…' : '✕ Reject'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Reviewed history */}
      {reviewed.length > 0 && (
        <div>
          <div style={{ ...sectionHeader, marginTop: pending.length > 0 ? 8 : 0 }}>History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reviewed.map(req => (
              <div key={req.requestId} className="clay-raised-sm" style={{
                background:   'var(--clay-surface)',
                padding:      '10px 14px',
                display:      'flex',
                justifyContent: 'space-between',
                alignItems:   'center',
                gap:          8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7689', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {req.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 1, fontFamily: 'DM Sans, sans-serif' }}>{req.userName}</div>
                </div>
                <span className="dash-badge" style={{
                  flexShrink: 0,
                  background: req.status === 'approved' ? '#ECFDF5' : 'var(--clay-surface)',
                  color:      req.status === 'approved' ? '#059669' : req.status === 'rejected' ? '#DC2626' : '#9AAAB8',
                  textTransform: 'capitalize',
                }}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const sectionHeader: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  fontSize:       11,
  fontWeight:     700,
  color:          '#0A0D12',
  textTransform:  'uppercase',
  letterSpacing:  '0.04em',
  fontFamily:     'DM Sans, sans-serif',
  marginBottom:   8,
}

const labelStyle: React.CSSProperties = {
  display:       'block',
  fontSize:      11,
  fontWeight:    600,
  color:         '#9AAAB8',
  marginBottom:  5,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontFamily:    'DM Sans, sans-serif',
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  padding:      '9px 12px',
  borderRadius: 12,
  border:       'none',
  background:   'var(--clay-surface)',
  boxShadow:    'inset 3px 3px 7px rgba(163,177,198,.3), inset -2px -2px 6px rgba(255,255,255,.6)',
  fontSize:     13,
  color:        '#0A0D12',
  fontFamily:   'DM Sans, sans-serif',
  outline:      'none',
}