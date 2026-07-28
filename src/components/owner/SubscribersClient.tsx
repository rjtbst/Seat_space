'use client'
import { useState } from 'react'
import { useOwner } from '@/contexts/OwnerContext'
import type { LibrarySubscriber } from '@/lib/actions/owner/subscribers'
import { LibraryPicker, PageHeader, Card, EmptyState } from '@/components/owner/ui'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'
import { ACCENT_LIGHT, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, FONT_DISPLAY } from '@/lib/constants/theme'

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
        title="Subscribed Students"
        subtitle="Everyone with a membership plan at this library — their seat, schedule, and check-in history."
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
          subtitle="Once a student subscribes to one of your plans for this library, they'll show up here with their assigned seat and QR check-in history."
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

function scheduleLabel(s: LibrarySubscriber): string {
  const time = s.timeWindowStart && s.timeWindowEnd
    ? `${s.timeWindowStart.slice(0, 5)}–${s.timeWindowEnd.slice(0, 5)}`
    : 'All day'
  const days = describeDaysOfWeek(s.daysOfWeek)
  return days ? `${time} · ${days}` : time
}

function SubscriberRow({ s }: { s: LibrarySubscriber }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 14, cursor: 'pointer' }}
      >
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
            {new Date(s.startDate).toLocaleDateString('en-IN')} – {new Date(s.endDate).toLocaleDateString('en-IN')} · {scheduleLabel(s)}
          </div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2, fontFamily: 'monospace' }}>
            Pass ID: {s.subscriptionId.slice(0, 8)}…
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 130 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>
            Seat {s.seatLabel ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 3 }}>
            {s.attendanceCount === 0
              ? 'No check-ins yet'
              : `${s.attendanceCount} check-in${s.attendanceCount === 1 ? '' : 's'}`}
          </div>
          {s.lastCheckIn && (
            <div style={{ fontSize: 10.5, color: TEXT_MUTED, marginTop: 2 }}>
              Last: {new Date(s.lastCheckIn).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
          {s.attendance.length > 0 && (
            <div style={{ fontSize: 10.5, color: '#1E5CFF', marginTop: 4, fontWeight: 700 }}>
              {expanded ? 'Hide history ▲' : 'View history ▼'}
            </div>
          )}
        </div>
      </div>

      {expanded && s.attendance.length > 0 && (
        <div style={{ borderTop: '1px solid #F0F4F8', padding: '10px 14px', background: '#FBFAF8' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Check-in / Check-out records
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {s.attendance.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: TEXT_SECONDARY }}>
                <span>
                  In: {new Date(a.checkInTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </span>
                <span>
                  {a.checkOutTime
                    ? `Out: ${new Date(a.checkOutTime).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
                    : '— still checked in'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
