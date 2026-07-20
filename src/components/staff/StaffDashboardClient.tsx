'use client'

// src/components/staff/StaffDashboardClient.tsx
import { useRouter } from 'next/navigation'
import type { StaffLibrary, StaffDashboardStats } from '@/lib/actions/staff'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const GREEN        = '#0D7C54'
const GREEN_LIGHT  = '#D1FAE5'
const AMBER        = '#D97706'
const AMBER_LIGHT  = '#FEF3E2'

function fmtDate() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  })
}

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0
  const color = pct >= 80 ? '#DC2626' : pct >= 50 ? AMBER : GREEN
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: '#6B7689' }}>Live occupancy</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: '#E2DDD4', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: color, borderRadius: 4,
          transition: 'width .4s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#9AAAB8' }}>
        <span>{occupied} occupied</span>
        <span>{total} total seats</span>
      </div>
    </div>
  )
}

export default function StaffDashboardClient({
  staffLib,
  stats,
}: {
  staffLib: StaffLibrary
  stats:    StaffDashboardStats
}) {
  const router = useRouter()
  const isSenior = staffLib.role === 'senior_staff'

  // Role-aware quick actions:
  // Senior staff → Seat Manager (has walk-in + toggle + force-free + add row)
  // Regular staff → Walk-in Desk (simple offline booking only)
  const quickActions = [
    {
      label:  'Scan QR',
      sub:    'Check-in student',
      emoji:  '📷',
      href:   '/staff/scanner',
      bg:     ACCENT_LIGHT,
      color:  ACCENT,
      border: 'rgba(5,151,167,.2)',
    },
    {
      label:  "Today's Bookings",
      sub:    `${stats.todayBookings} total`,
      emoji:  '📋',
      href:   '/staff/bookings',
      bg:     GREEN_LIGHT,
      color:  GREEN,
      border: 'rgba(13,124,84,.2)',
    },
    isSenior
      ? {
          label:  'Seat Manager',
          sub:    'Book, toggle, force-free',
          emoji:  '🗺️',
          href:   '/staff/seat-manager',
          bg:     '#EFF6FF',
          color:  '#1E5CFF',
          border: 'rgba(30,92,255,.2)',
        }
      : {
          label:  'Walk-in Desk',
          sub:    'Manual booking',
          emoji:  '🪑',
          href:   '/staff/walk-in',
          bg:     AMBER_LIGHT,
          color:  AMBER,
          border: 'rgba(217,119,6,.2)',
        },
    {
      label:  'Book Issuance',
      sub:    'Issue / return',
      emoji:  '📚',
      href:   '/staff/books',
      bg:     '#F0E8FF',
      color:  '#6D28D9',
      border: 'rgba(109,40,217,.2)',
    },
  ]

  return (
    <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: ACCENT, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 18,
          }}>
            {isSenior ? '⭐' : '🔑'}
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9AAAB8', fontWeight: 500 }}>
              {isSenior ? 'Senior Staff Dashboard' : 'Staff Dashboard'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
              {staffLib.libraryName}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#9AAAB8', marginLeft: 46 }}>
          📍 {[staffLib.area, staffLib.city].filter(Boolean).join(', ')} · {fmtDate()}
        </div>
      </div>

      {/* Senior staff badge */}
      {isSenior && (
        <div style={{
          background: '#EFF6FF', border: '1px solid rgba(30,92,255,.2)',
          borderRadius: 10, padding: '8px 12px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#1E5CFF', fontWeight: 600,
        }}>
          ⭐ Senior Staff — full seat manager access enabled
        </div>
      )}

      {/* Occupancy card */}
      <div style={{
        background: '#FDFCF9', border: '1px solid #E2DDD4',
        borderRadius: 16, padding: '16px 18px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(10,13,18,.04)',
      }}>
        <OccupancyBar occupied={stats.currentlyOccupied} total={stats.totalActiveSeats} />

        {stats.heldSeats > 0 && (
          <div style={{
            marginTop: 10, padding: '6px 10px',
            background: AMBER_LIGHT, borderRadius: 8,
            fontSize: 12, color: AMBER, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ⏳ {stats.heldSeats} seat{stats.heldSeats > 1 ? 's' : ''} held — payment in progress
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { value: stats.todayBookings,   label: 'Today',      bg: '#F9F8F5',   color: '#0A0D12' },
          { value: stats.checkedIn,       label: 'Checked-in', bg: GREEN_LIGHT, color: GREEN     },
          { value: stats.pendingCheckIns, label: 'Pending',    bg: AMBER_LIGHT, color: AMBER     },
        ].map(({ value, label, bg, color }) => (
          <div key={label} style={{
            background: bg, borderRadius: 12, padding: '12px 10px',
            textAlign: 'center', border: '1px solid #E2DDD4',
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Syne, sans-serif', color }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: '#9AAAB8', marginTop: 2, fontWeight: 500 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{
        fontSize: 12, fontWeight: 600, color: '#9AAAB8',
        marginBottom: 10, letterSpacing: '.05em', textTransform: 'uppercase',
      }}>
        Quick Actions
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {quickActions.map(a => (
          <button
            key={a.href}
            onClick={() => router.push(a.href)}
            style={{
              background:   a.bg,
              border:       `1.5px solid ${a.border}`,
              borderRadius: 14,
              padding:      '16px 14px',
              textAlign:    'left',
              cursor:       'pointer',
              transition:   'transform .1s',
              fontFamily:   'DM Sans, sans-serif',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(.97)')}
            onMouseUp={e   => (e.currentTarget.style.transform = 'scale(1)')}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(.97)')}
            onTouchEnd={e   => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ fontSize: 26, marginBottom: 8 }}>{a.emoji}</div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: a.color,
              marginBottom: 2, fontFamily: 'Syne, sans-serif',
            }}>
              {a.label}
            </div>
            <div style={{ fontSize: 11, color: '#9AAAB8' }}>{a.sub}</div>
          </button>
        ))}
      </div>

      {/* Pending check-ins CTA */}
      {stats.pendingCheckIns > 0 && (
        <button
          onClick={() => router.push('/staff/bookings')}
          style={{
            marginTop:      16,
            width:          '100%',
            padding:        '13px 16px',
            borderRadius:   12,
            border:         'none',
            background:     ACCENT,
            color:          '#fff',
            fontSize:       14,
            fontWeight:     700,
            fontFamily:     'Syne, sans-serif',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            8,
            boxShadow:      '0 4px 16px rgba(5,151,167,.3)',
          }}
        >
          ✓ {stats.pendingCheckIns} pending check-in{stats.pendingCheckIns > 1 ? 's' : ''} — tap to review
        </button>
      )}
    </div>
  )
}