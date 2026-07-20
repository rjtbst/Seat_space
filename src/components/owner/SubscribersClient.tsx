'use client'
import { useOwner } from '@/contexts/OwnerContext'
import type { LibrarySubscriber } from '@/lib/actions/owner/subscribers'
import { LibraryPicker, PageHeader, Card, EmptyState } from '@/components/owner/ui'
import { ACCENT, ACCENT_LIGHT, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, FONT_DISPLAY } from '@/lib/constants/theme'

export default function SubscribersClient({
  libraryId, subscribers,
}: {
  libraryId:   string
  subscribers: LibrarySubscriber[]
}) {
  const { libraries } = useOwner()

  const active  = subscribers.filter(s => s.status === 'active')
  const others  = subscribers.filter(s => s.status !== 'active')

  return (
    <div>
      <PageHeader
        title="Subscribers"
        subtitle="Everyone with a membership plan at this library, and how much of it they've used."
      />

      <LibraryPicker
        libraries={libraries}
        currentId={libraryId}
        buildHref={(id) => `/dashboard/subscribers?lib=${id}`}
      />

      {subscribers.length === 0 ? (
        <EmptyState
          icon="🎫"
          title="No subscribers yet"
          subtitle="Once a student subscribes to one of your plans for this library, they'll show up here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SECONDARY, marginTop: 4, marginBottom: 2 }}>
              Active ({active.length})
            </div>
          )}
          {active.map(s => <SubscriberRow key={s.subscriptionId} s={s} />)}

          {others.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED, marginTop: 16, marginBottom: 2 }}>
              Past ({others.length})
            </div>
          )}
          {others.map(s => <SubscriberRow key={s.subscriptionId} s={s} />)}
        </div>
      )}
    </div>
  )
}

function SubStatusBadge({ status }: { status: string }) {
  const style = status === 'active'
    ? { bg: ACCENT_LIGHT, color: '#0A5E3F', label: 'Active' }
    : status === 'pending'
    ? { bg: '#FEF3E2', color: '#92400E', label: 'Pending' }
    : status === 'expired'
    ? { bg: '#F0F4F8', color: '#6E7F94', label: 'Expired' }
    : { bg: '#FEE2E2', color: '#9B1C1C', label: 'Cancelled' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
      background: style.bg, color: style.color,
    }}>
      {style.label}
    </span>
  )
}

function SubscriberRow({ s }: { s: LibrarySubscriber }) {
  const pct = s.sessionsLimit ? Math.min(100, Math.round((s.sessionsUsed / s.sessionsLimit) * 100)) : null

  return (
    <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: TEXT_PRIMARY }}>
            {s.studentName}
          </span>
          <SubStatusBadge status={s.status} />
        </div>
        <div style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginTop: 3 }}>
          {s.planName}{s.studentWhatsapp ? ` · ${s.studentWhatsapp}` : ''}
        </div>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
          {new Date(s.startDate).toLocaleDateString('en-IN')} – {new Date(s.endDate).toLocaleDateString('en-IN')}
        </div>
      </div>

      <div style={{ textAlign: 'right', minWidth: 100 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>
          {s.sessionsLimit === null ? 'Unlimited' : `${s.sessionsUsed}/${s.sessionsLimit} sessions`}
        </div>
        {pct !== null && (
          <div style={{ width: 100, height: 5, borderRadius: 3, background: '#EEF2F7', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#C5282C' : ACCENT }} />
          </div>
        )}
      </div>
    </Card>
  )
}
