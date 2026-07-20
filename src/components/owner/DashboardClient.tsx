// src/components/owner/DashboardClient.tsx
'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { DashboardStats, MonthRevPoint, TodayBooking, SlotBand } from '@/lib/actions/owner'
import { checkInBooking } from '@/lib/actions/owner'
import { fmtTime, fmtCurrency, pctDelta, deltaColor, fmtISTDate } from '@/lib/utils/format'
import {
  ACCENT, ACCENT_LIGHT, BLUE, BLUE_LIGHT,
  STATUS_STYLE,
  BORDER, BG_CARD, SHADOW_SM,
  FONT_DISPLAY, FONT_BODY,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/lib/constants/theme'
import { useOwner } from '@/contexts/OwnerContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { LibraryPicker } from '@/components/owner/ui'

/* ─── Stat card ────────────────────────────────────────────────────────────── */
// Using local StatCard here since dashboard has slightly different sizing than
// the generic shared one (no card border-radius override needed at dashboard level).
function StatCard({
  icon, label, value, delta, deltaColor: dc, sub,
}: {
  icon: string; label: string; value: string
  delta?: string; deltaColor?: string; sub?: string
}) {
  return (
    <div style={{
      background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: '16px 18px', boxShadow: SHADOW_SM, flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: FONT_DISPLAY, color: TEXT_PRIMARY, letterSpacing: '-0.02em', marginBottom: 4 }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 12, fontWeight: 600, color: dc ?? ACCENT }}>
          {delta}
          {sub ? <span style={{ color: TEXT_MUTED, fontWeight: 400, marginLeft: 4 }}>{sub}</span> : null}
        </div>
      )}
    </div>
  )
}

/* ─── Revenue bar chart ────────────────────────────────────────────────────── */
function RevenueChart({ data }: { data: MonthRevPoint[] }) {
  const max     = Math.max(...data.map(d => d.amount), 1)
  const current = data[data.length - 1]
  const prev    = data[data.length - 2]

  return (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: SHADOW_SM }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>Monthly Revenue</div>
        <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500 }}>Last 7 months</span>
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginBottom: 8 }}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1
          const h      = max > 0 ? Math.max(4, Math.round((d.amount / max) * 90)) : 4
          return (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '100%', height: h, borderRadius: '4px 4px 0 0',
                background: isLast ? `linear-gradient(to top, ${BLUE}, #4A7FFF)` : BLUE_LIGHT,
                boxShadow: isLast ? `0 -2px 8px rgba(30,92,255,.3)` : 'none',
                transition: 'height .3s ease',
              }} />
            </div>
          )
        })}
      </div>

      {/* Month labels */}
      <div style={{ display: 'flex', gap: 6 }}>
        {data.map(d => (
          <div key={d.month} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: TEXT_MUTED, fontWeight: 500 }}>
            {d.month}
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: BORDER, margin: '14px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>This month</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRIMARY, fontFamily: FONT_DISPLAY }}>
            {fmtCurrency(current?.amount ?? 0)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>vs last month</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: deltaColor(current?.amount ?? 0, prev?.amount ?? 0) }}>
            {pctDelta(current?.amount ?? 0, prev?.amount ?? 0)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Occupancy donut ──────────────────────────────────────────────────────── */
function OccupancyDonut({ stats }: { stats: DashboardStats }) {
  const r   = 30
  const c   = 2 * Math.PI * r
  const pct = stats.occupancy_pct / 100

  return (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: SHADOW_SM }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>Seat Occupancy — Live</div>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#22C55E',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
          <circle cx="40" cy="40" r={r} fill="none" stroke={BORDER} strokeWidth="12" />
          <circle
            cx="40" cy="40" r={r} fill="none"
            stroke={BLUE} strokeWidth="12"
            strokeDasharray={`${c * pct} ${c * (1 - pct)}`}
            strokeDashoffset={c * 0.25}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .6s ease' }}
          />
          <text x="40" y="44" textAnchor="middle" fontSize="14" fontWeight="800" fill={TEXT_PRIMARY} fontFamily="DM Sans,sans-serif">
            {stats.occupancy_pct}%
          </text>
        </svg>

        <div style={{ flex: 1 }}>
          {[
            { color: BLUE,      label: 'Occupied',  count: stats.occupied_seats },
            { color: ACCENT,    label: 'Available', count: stats.total_active_seats - stats.occupied_seats - stats.held_seats },
            { color: '#F59E0B', label: 'Held',      count: stats.held_seats },
          ].map(({ color, label, count }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>
                {label}: <strong style={{ color: TEXT_PRIMARY }}>{count}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Slot heatmap ─────────────────────────────────────────────────────────── */
function SlotHeatmap({ data }: { data: SlotBand[] }) {
  return (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: SHADOW_SM }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 14 }}>Slot Popularity</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(band => (
          <div key={band.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: TEXT_MUTED, width: 60, flexShrink: 0 }}>{band.label}</span>
            <div style={{ flex: 1, background: '#F4F7FB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${band.pct}%`, height: '100%', borderRadius: 4,
                background: band.pct > 80 ? BLUE : band.pct > 60 ? '#0597A7' : ACCENT,
                transition: 'width .4s ease',
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_PRIMARY, width: 28, textAlign: 'right' }}>
              {band.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Bookings table ────────────────────────────────────────────────────────── */
function BookingsTable({
  bookings, onCheckIn, isMobile,
}: {
  bookings:  TodayBooking[]
  onCheckIn: (id: string) => void
  isMobile:  boolean
}) {
  if (!bookings.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: TEXT_MUTED }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No bookings today yet</div>
      </div>
    )
  }

  /* Mobile: card list */
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {bookings.map(b => {
          const st         = STATUS_STYLE[b.status] ?? STATUS_STYLE.confirmed
          const canCheckIn = b.status === 'confirmed'
          return (
            <div key={b.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F0EDE8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 2 }}>{b.student}</div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED }}>
                    {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                    {b.phone && ` · ${b.phone}`}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: BLUE_LIGHT, color: BLUE }}>
                    {b.seat_label}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>
              {canCheckIn && (
                <button
                  onClick={() => onCheckIn(b.id)}
                  style={{
                    width: '100%', padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: ACCENT_LIGHT, color: ACCENT, border: `1px solid rgba(13,124,84,.2)`,
                    cursor: 'pointer', fontFamily: FONT_BODY, marginTop: 4,
                  }}
                >
                  ✓ Check-in
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /* Desktop: full table */
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Time', 'Student', 'Seat', 'Plan', 'Status', ''].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 12px',
                fontSize: 11, fontWeight: 700, color: TEXT_MUTED,
                textTransform: 'uppercase', letterSpacing: '.05em',
                borderBottom: `1px solid ${BORDER}`,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bookings.map(b => {
            const st         = STATUS_STYLE[b.status] ?? STATUS_STYLE.confirmed
            const canCheckIn = b.status === 'confirmed'
            return (
              <tr key={b.id} style={{ borderBottom: '1px solid #F0EDE8' }}>
                <td style={{ padding: '10px 12px', color: TEXT_SECONDARY, whiteSpace: 'nowrap' }}>
                  {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: TEXT_PRIMARY }}>
                  {b.student}
                  {b.phone && <div style={{ fontSize: 11, fontWeight: 400, color: TEXT_MUTED }}>{b.phone}</div>}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: BLUE_LIGHT, color: BLUE }}>
                    {b.seat_label}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: TEXT_SECONDARY }}>{b.plan}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {canCheckIn && (
                    <button
                      onClick={() => onCheckIn(b.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        background: ACCENT_LIGHT, color: ACCENT, border: `1px solid rgba(13,124,84,.2)`,
                        cursor: 'pointer', fontFamily: FONT_BODY,
                      }}
                    >
                      ✓ Check-in
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Quick actions ─────────────────────────────────────────────────────────── */
function QuickActions() {
  const router = useRouter()

  const actions = [
    { icon: '📷', label: 'QR Scanner',   href: '/staff/scanner'           },
    { icon: '💺', label: 'Seat Manager', href: '/dashboard/seat-manager'  },
    { icon: '⏰', label: 'Slot Config',  href: '/dashboard/slot-config'   },
    { icon: '🎯', label: 'Plan Builder', href: '/dashboard/plan-builder'  },
  ]

  const navigate = useCallback((href: string) => {
    ;(window as any).__startNavProgress?.()
    router.push(href)
  }, [router])

  return (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: SHADOW_SM }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 12 }}>Quick Actions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map(a => (
          <button
            key={a.href}
            onClick={() => navigate(a.href)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 9, textAlign: 'left',
              border: `1.5px solid ${BORDER}`, background: BG_CARD,
              cursor: 'pointer', fontFamily: FONT_BODY,
              fontSize: 13, fontWeight: 500, color: '#3A4A5C',
              transition: 'all .12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = ACCENT
              e.currentTarget.style.color = ACCENT
              e.currentTarget.style.background = ACCENT_LIGHT
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = BORDER
              e.currentTarget.style.color = '#3A4A5C'
              e.currentTarget.style.background = BG_CARD
            }}
          >
            <span style={{ fontSize: 18 }}>{a.icon}</span>
            {a.label}
            <span style={{ marginLeft: 'auto', color: '#C8D4C8' }}>→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Main client component ────────────────────────────────────────────────── */

export default function DashboardClient({
  libraryName, libraryId, stats, revenue, bookings, heatmap,
}: {
  libraryName: string
  libraryId:   string
  // libraries REMOVED — from useOwner() context
  stats:       DashboardStats | null
  revenue:     MonthRevPoint[]
  bookings:    TodayBooking[]
  heatmap:     SlotBand[]
}) {
  const router   = useRouter()
  const isMobile = useIsMobile()
  const { libraries } = useOwner()       // ← from context, no prop, no extra DB call

  const [localBookings, setLocalBookings] = useState(bookings)
  const [isPending, startTransition]      = useTransition()

  const handleCheckIn = useCallback((bookingId: string) => {
    startTransition(async () => {
      const res = await checkInBooking(bookingId)
      if (res.success) {
        setLocalBookings(prev =>
          prev.map(b => b.id === bookingId ? { ...b, status: 'checked_in' } : b)
        )
      }
    })
  }, [])

  const navigate = useCallback((href: string) => {
    ;(window as any).__startNavProgress?.()
    router.push(href)
  }, [router])

  const s = stats ?? {
    today_revenue: 0, yesterday_revenue: 0, today_bookings: 0, yesterday_bookings: 0,
    occupancy_pct: 0, occupied_seats: 0, total_active_seats: 0, held_seats: 0,
    total_members: 0, new_members_month: 0,
  }

  return (
    <div style={{ padding: isMobile ? '16px 14px' : '28px 32px', maxWidth: 1200 }}>

      {/* Page header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: isMobile ? 16 : 24, flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <h1 style={{
            fontFamily: FONT_DISPLAY, fontWeight: 800,
            fontSize: isMobile ? 20 : 24,
            color: TEXT_PRIMARY, letterSpacing: '-0.03em', margin: 0, marginBottom: 4,
          }}>
            Owner Dashboard
          </h1>
          <div style={{ fontSize: isMobile ? 12 : 13, color: TEXT_SECONDARY }}>
            {libraryName} · {fmtISTDate()}
          </div>
        </div>
        <button
          onClick={() => navigate('/onboarding/add-library')}
          style={{
            padding: isMobile ? '8px 12px' : '9px 16px',
            borderRadius: 9, fontSize: isMobile ? 12 : 13, fontWeight: 700,
            background: ACCENT, color: '#fff', border: 'none',
            cursor: 'pointer', fontFamily: FONT_DISPLAY,
            boxShadow: '0 2px 10px rgba(13,124,84,.25)',
          }}
        >
          + Add Library
        </button>
      </div>

      {/* Library picker — shared component, triggers progress bar automatically */}
      <LibraryPicker
        libraries={libraries}
        currentId={libraryId}
        buildHref={id => `/dashboard?lib=${id}`}
        colorScheme="green"
      />
      {libraries.length > 1 && <div style={{ marginBottom: isMobile ? 14 : 20 }} />}

      {/* Stats row — 2×2 on mobile, 4-up on desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 8 : 12, marginBottom: isMobile ? 14 : 20,
      }}>
        <StatCard
          icon="₹"
          label="Today's Revenue"
          value={fmtCurrency(s.today_revenue)}
          delta={`${pctDelta(s.today_revenue, s.yesterday_revenue)} vs yesterday`}
          deltaColor={deltaColor(s.today_revenue, s.yesterday_revenue)}
        />
        <StatCard
          icon="📋"
          label="Bookings Today"
          value={String(s.today_bookings)}
          delta={`${s.today_bookings >= s.yesterday_bookings ? '↑' : '↓'} ${Math.abs(s.today_bookings - s.yesterday_bookings)} from yesterday`}
          deltaColor={s.today_bookings >= s.yesterday_bookings ? ACCENT : '#C5282C'}
        />
        <StatCard
          icon="💺"
          label="Occupancy Rate"
          value={`${s.occupancy_pct}%`}
          delta={`${s.occupied_seats} / ${s.total_active_seats} seats active`}
          deltaColor={TEXT_SECONDARY}
        />
        <StatCard
          icon="⭐"
          label="Members"
          value={String(s.total_members)}
          delta={`↑ ${s.new_members_month} this month`}
          deltaColor={ACCENT}
        />
      </div>

      {/* Two-column layout — stacks on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
        gap: isMobile ? 12 : 16, alignItems: 'start',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          <RevenueChart data={revenue} />

          {/* Today's bookings */}
          <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: SHADOW_SM }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: isMobile ? '12px 14px' : '16px 20px',
              borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>Today's Bookings</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: BLUE_LIGHT, color: BLUE }}>
                  {s.today_bookings} total
                </span>
                <button
                  onClick={() => navigate('/dashboard/bookings')}
                  style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    border: `1.5px solid ${BORDER}`, background: BG_CARD,
                    color: '#3A4A5C', cursor: 'pointer', fontFamily: FONT_BODY,
                  }}
                >
                  View all →
                </button>
              </div>
            </div>
            <div style={{ padding: '0 0 4px' }}>
              <BookingsTable
                bookings={localBookings.slice(0, 6)}
                onCheckIn={handleCheckIn}
                isMobile={isMobile}
              />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
          <OccupancyDonut stats={s} />
          <SlotHeatmap data={heatmap} />
          <QuickActions />
        </div>
      </div>
    </div>
  )
}