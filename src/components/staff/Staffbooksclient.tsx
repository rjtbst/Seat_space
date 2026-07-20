'use client'

// src/app/(staff)/staff/books/_components/StaffBooksClient.tsx
import { useState } from 'react'
import type { StaffBooksPageData } from '@/lib/actions/staff-book-action'
import IssueTab        from '@/components/staff/IssueTab'
import ActiveIssuesTab from '@/components/staff/Activeissuetab'
import RequestsTab     from '@/components/staff/RequestTab'
import CatalogTab      from '@/components/staff/Catalog'
import { ACCENT } from '@/lib/constants/theme'



type Tab = 'issue' | 'active' | 'requests' | 'catalog'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'issue',    label: 'Issue',    emoji: '📤' },
  { id: 'active',   label: 'Active',   emoji: '📋' },
  { id: 'requests', label: 'Requests', emoji: '🔔' },
  { id: 'catalog',  label: 'Catalog',  emoji: '📚' },
]

export default function StaffBooksClient({ data }: { data: StaffBooksPageData }) {
  const [activeTab, setActiveTab]     = useState<Tab>('issue')
  // local state lifted so tabs can update each other (e.g. issue → active refreshes)
  const [catalog, setCatalog]     = useState(data.catalog)
  const [activeIssues, setActiveIssues] = useState(data.activeIssues)
  const [requests,    setRequests]    = useState(data.requests)

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const overdueCount = activeIssues.filter(i => i.isOverdue).length

  return (
    <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
          color: '#0A0D12', letterSpacing: '-0.03em', margin: 0, marginBottom: 2,
        }}>
          Book Issuance
        </h1>
        <div style={{ fontSize: 12, color: '#9AAAB8' }}>
          {data.libraryName}
          {overdueCount > 0 && (
            <span style={{ marginLeft: 8, color: '#DC2626', fontWeight: 600 }}>
              · {overdueCount} overdue
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4,
        background: '#F4F7FB', borderRadius: 12, padding: 4,
        marginBottom: 20, border: '1px solid #E2DDD4',
      }}>
        {TABS.map(tab => {
          const active  = activeTab === tab.id
          const badge   = tab.id === 'requests' ? pendingCount
                        : tab.id === 'active'   ? overdueCount
                        : 0
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex:         1,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                gap:          4,
                padding:      '8px 4px',
                borderRadius: 9,
                border:       'none',
                background:   active ? '#FDFCF9' : 'transparent',
                color:        active ? ACCENT : '#6B7689',
                fontSize:     12,
                fontWeight:   active ? 700 : 500,
                cursor:       'pointer',
                fontFamily:   'DM Sans, sans-serif',
                boxShadow:    active ? '0 1px 4px rgba(10,13,18,.08)' : 'none',
                transition:   'all .15s',
                position:     'relative',
              }}
            >
              <span style={{ fontSize: 14 }}>{tab.emoji}</span>
              <span style={{ display: 'none' }}>{/* label hidden on mobile for space */}</span>
              <span style={{ fontSize: 11 }}>{tab.label}</span>
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  background: tab.id === 'active' ? '#DC2626' : ACCENT,
                  color: '#fff', borderRadius: '50%',
                  width: 16, height: 16, fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'issue' && (
        <IssueTab
          libraryId={data.libraryId}
          catalog={catalog}
          onIssued={(updatedCatalog, newIssue) => {
            setCatalog(updatedCatalog)
            setActiveIssues(prev => [newIssue, ...prev])
            setActiveTab('active')
          }}
        />
      )}

      {activeTab === 'active' && (
        <ActiveIssuesTab
          libraryId={data.libraryId}
          issues={activeIssues}
          onReturned={(issueId, updatedCopyCounts) => {
            setActiveIssues(prev => prev.filter(i => i.issueId !== issueId))
            setCatalog(prev => prev.map(b =>
              updatedCopyCounts[b.bookId]
                ? { ...b, availableCopies: b.availableCopies + 1, issuedCopies: b.issuedCopies - 1 }
                : b
            ))
          }}
        />
      )}

      {activeTab === 'requests' && (
        <RequestsTab
          libraryId={data.libraryId}
          requests={requests}
          catalog={catalog}
          onApproved={(requestId, newIssue, updatedCatalog) => {
            setRequests(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'approved' as const } : r))
            setActiveIssues(prev => [newIssue, ...prev])
            setCatalog(updatedCatalog)
          }}
          onRejected={(requestId) => {
            setRequests(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'rejected' as const } : r))
          }}
        />
      )}

      {activeTab === 'catalog' && (
        <CatalogTab
          libraryId={data.libraryId}
          isSenior={data.isSenior}
          catalog={catalog}
          onCatalogChange={setCatalog}
        />
      )}
    </div>
  )
}