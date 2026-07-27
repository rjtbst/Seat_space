'use client'

// src/app/(staff)/staff/books/_components/ActiveIssuesTab.tsx
import { useState } from 'react'
import type { BookIssue } from '@/lib/actions/staff-book-action'
import { returnBook } from '@/lib/actions/staff-book-action'
import { ACCENT } from '@/lib/constants/theme'

type Props = {
  libraryId:  string
  issues:     BookIssue[]
  onReturned: (issueId: string, updatedCopyCounts: Record<string, boolean>) => void
}

export default function ActiveIssuesTab({ libraryId, issues, onReturned }: Props) {
  const [returning, setReturning] = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [done,      setDone]      = useState<Set<string>>(new Set())

  const handleReturn = async (issue: BookIssue) => {
    setReturning(issue.issueId)
    setError(null)
    const res = await returnBook(issue.issueId, libraryId)
    setReturning(null)
    if (res.success == false) return setError(res.error ?? 'Failed to return')
    setDone(prev => new Set(prev).add(issue.issueId))
    setTimeout(() => {
      onReturned(issue.issueId, { [issue.bookId]: true })
    }, 600)
  }

  const overdue  = issues.filter(i => i.isOverdue)
  const onTime   = issues.filter(i => !i.isOverdue)

  if (issues.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#9AAAB8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>No active issues</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 8, fontFamily: 'DM Sans, sans-serif' }}>
          {error}
        </div>
      )}

      {/* Overdue first */}
      {overdue.length > 0 && (
        <div>
          <div style={sectionHeader}>
            <span style={{ color: '#DC2626' }}>⚠ Overdue</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: 20 }}>
              {overdue.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdue.map(issue => (
              <IssueCard
                key={issue.issueId}
                issue={issue}
                returning={returning === issue.issueId}
                done={done.has(issue.issueId)}
                onReturn={() => handleReturn(issue)}
              />
            ))}
          </div>
        </div>
      )}

      {/* On-time */}
      {onTime.length > 0 && (
        <div>
          {overdue.length > 0 && (
            <div style={sectionHeader}>
              <span>Active</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT, background: '#F4F7FB', padding: '2px 8px', borderRadius: 20 }}>
                {onTime.length}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onTime.map(issue => (
              <IssueCard
                key={issue.issueId}
                issue={issue}
                returning={returning === issue.issueId}
                done={done.has(issue.issueId)}
                onReturn={() => handleReturn(issue)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IssueCard({
  issue, returning, done, onReturn,
}: {
  issue: BookIssue
  returning: boolean
  done: boolean
  onReturn: () => void
}) {
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })

  return (
    <div style={{
      background: done ? '#ECFDF5' : issue.isOverdue ? '#FFF5F5' : '#FDFCF9',
      border:     `1px solid ${done ? '#A7F3D0' : issue.isOverdue ? '#FECACA' : '#E2DDD4'}`,
      borderRadius: 10,
      padding:    '12px 14px',
      transition: 'background .3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {issue.title}
          </div>
          {issue.author && (
            <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 1, fontFamily: 'DM Sans, sans-serif' }}>{issue.author}</div>
          )}
        </div>
        <button className="press"
          onClick={onReturn}
          disabled={returning || done}
          style={{
            background:   done ? '#059669' : returning ? '#9AAAB8' : ACCENT,
            color:        '#fff',
            border:       'none',
            borderRadius: 7,
            padding:      '6px 12px',
            fontSize:     11,
            fontWeight:   700,
            cursor:       returning || done ? 'default' : 'pointer',
            fontFamily:   'DM Sans, sans-serif',
            whiteSpace:   'nowrap',
            flexShrink:   0,
          }}
        >
          {done ? '✓ Done' : returning ? '…' : 'Return'}
        </button>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Chip icon="👤" label={issue.issuedTo} />
        {issue.phone && <Chip icon="📱" label={issue.phone} />}
        <Chip icon="📅" label={`Due ${issue.dueDate ? fmtDate(issue.dueDate) : '—'}`} color={issue.isOverdue ? '#DC2626' : undefined} />
        {issue.isOverdue && (
          <Chip icon="⚠" label={`${issue.daysOverdue}d overdue`} color="#DC2626" />
        )}
      </div>
    </div>
  )
}

function Chip({ icon, label, color }: { icon: string; label: string; color?: string }) {
  return (
    <span style={{
      display:    'inline-flex',
      alignItems: 'center',
      gap:        4,
      fontSize:   11,
      color:      color ?? '#6B7689',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  )
}

const sectionHeader: React.CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  justifyContent: 'space-between',
  fontSize:      11,
  fontWeight:    700,
  color:         '#0A0D12',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontFamily:    'DM Sans, sans-serif',
  marginBottom:  8,
}