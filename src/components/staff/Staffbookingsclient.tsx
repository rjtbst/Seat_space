'use client'

// src/app/(staff)/staff/bookings/_components/StaffBookingsClient.tsx


import { useState, useTransition }  from 'react'
import type { StaffBooking }         from '@/lib/actions/staff'
import type { SlotConfig }           from '@/lib/actions/staff-seat-actions'  // new file
import { staffCheckIn }              from '@/lib/actions/staff'
import { fmtISTTime, getISTHour }    from '@/lib/ist'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const GREEN        = '#0D7C54'
const GREEN_LIGHT  = '#D1FAE5'
const BLUE         = '#1E5CFF'
const BLUE_LIGHT   = '#E8EFFE'

/* ─── Slot label helpers ──────────────────────────────────────────────────── */

/** "06:00" → 6,  "09:30" → 9,  "18:00" → 18 */
function slotHour(timeStr: string): number {
  return parseInt(timeStr.split(':')[0] ?? '0', 10)
}

/** "06:00" → "6 AM",  "12:00" → "12 PM",  "18:30" → "6:30 PM" */
function fmtHHmm(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':')
  const h   = parseInt(hStr ?? '0', 10)
  const m   = parseInt(mStr ?? '0', 10)
  const pm  = h >= 12
  const h12 = h % 12 || 12
  const min = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
  return `${h12}${min} ${pm ? 'PM' : 'AM'}`
}

/** Builds a human-readable tab label from a SlotConfig. */
function slotLabel(s: SlotConfig): string {
  return `${fmtHHmm(s.start)}–${fmtHHmm(s.end)}`
}

/* ─── Status styles ───────────────────────────────────────────────────────── */

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  confirmed:  { bg: BLUE_LIGHT,   color: '#1447D4', label: 'Booked'       },
  checked_in: { bg: GREEN_LIGHT,  color: '#0A5E3F', label: '✓ Checked In' },
  held:       { bg: '#FEF3E2',    color: '#92400E', label: 'Held'         },
  cancelled:  { bg: '#FEE2E2',    color: '#9B1C1C', label: 'Cancelled'    },
  no_show:    { bg: '#FEE2E2',    color: '#9B1C1C', label: 'No-show'      },
  completed:  { bg: GREEN_LIGHT,  color: '#14532D', label: 'Completed'    },
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function StaffBookingsClient({
  bookings: initial,
  libraryName,
  libraryId,
  slots,
}: {
  bookings:    StaffBooking[]
  libraryName: string
  libraryId:   string
  /** Active slot configs fetched from library description.
   *  Pass [] if the library has no slot config — only "All" tab will show. */
  slots:       SlotConfig[]
}) {
  const [bookings, setBookings]      = useState(initial)
  // activeSlot is either 'All' or a SlotConfig.id
  const [activeSlot, setActiveSlot]  = useState<string>('All')
  const [toast, setToast]            = useState('')
  const [isPending, startTransition] = useTransition()

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  })

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  /* ── Filtering ─────────────────────────────────────────────────────────── */

  const filtered = activeSlot === 'All'
    ? bookings
    : bookings.filter(b => {
        const slot = slots.find(s => s.id === activeSlot)
        if (!slot) return true
        const sh = slotHour(slot.start)
        const eh = slotHour(slot.end)
        return getISTHour(b.startTime) >= sh && getISTHour(b.startTime) < eh
      })

  const checkedIn       = bookings.filter(b => b.status === 'checked_in').length
  const pendingCheckIns = bookings.filter(b => b.status === 'confirmed').length

  /* ── Check-in handler ──────────────────────────────────────────────────── */

  const handleCheckIn = (bookingId: string, studentName: string) => {
    startTransition(async () => {
      const res = await staffCheckIn(bookingId)
      if (res.success) {
        setBookings(prev =>
          prev.map(b => b.id === bookingId ? { ...b, status: 'checked_in' } : b)
        )
        showToast(`✓ ${studentName} checked in`)
      } else {
        showToast((res as any).error ?? 'Check-in failed')
      }
    })
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: '#0A0D12', color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,.2)', whiteSpace: 'nowrap',
          animation: 'fadeUp .2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
          color: '#0A0D12', letterSpacing: '-0.03em', margin: 0, marginBottom: 2,
        }}>
          Today's Bookings
        </h1>
        <div style={{ fontSize: 12, color: '#9AAAB8' }}>{libraryName} · {today}</div>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { value: bookings.length, label: 'Total',   bg: '#F9F8F5',   color: '#0A0D12' },
          { value: checkedIn,       label: 'In',      bg: GREEN_LIGHT, color: GREEN     },
          { value: pendingCheckIns, label: 'Pending', bg: ACCENT_LIGHT, color: ACCENT  },
        ].map(({ value, label, bg, color }) => (
          <div key={label} style={{
            flex: 1, textAlign: 'center', padding: '10px 8px',
            background: bg, borderRadius: 12, border: '1px solid #E2DDD4',
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Syne, sans-serif', color }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: '#9AAAB8' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Dynamic slot tabs ─────────────────────────────────────────────── */}
      {/* Only rendered when slots exist; "All" is always first */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto',
        marginBottom: 14, paddingBottom: 2,
      }}>
        {/* All tab */}
        <SlotTab
          label="All"
          active={activeSlot === 'All'}
          onClick={() => setActiveSlot('All')}
        />

        {/* One tab per active slot config */}
        {slots.map(slot => (
          <SlotTab
            key={slot.id}
            label={slotLabel(slot)}
            active={activeSlot === slot.id}
            onClick={() => setActiveSlot(slot.id)}
          />
        ))}
      </div>

      {/* ── Booking cards ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9AAAB8' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 14 }}>No bookings for this slot</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(b => {
            const st         = STATUS_STYLE[b.status] ?? STATUS_STYLE.confirmed
            const canCheckIn = b.status === 'confirmed'

            return (
              <div
                key={b.id}
                style={{
                  background:   '#FDFCF9',
                  border:       `1.5px solid ${canCheckIn ? 'rgba(5,151,167,.3)' : '#E2DDD4'}`,
                  borderRadius: 14,
                  padding:      '14px 16px',
                  boxShadow:    '0 1px 4px rgba(10,13,18,.04)',
                }}
              >
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    {/* Seat chip + name */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
                    }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: BLUE_LIGHT, color: BLUE,
                      }}>
                        {b.seatLabel}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0A0D12' }}>
                        {b.studentName}
                      </span>
                    </div>
                    {/* Time + plan */}
                    <div style={{ fontSize: 12, color: '#6B7689' }}>
                      {fmtISTTime(b.startTime)} – {fmtISTTime(b.endTime)}
                      {b.plan && (
                        <span style={{ marginLeft: 8, color: '#9AAAB8' }}>· {b.plan}</span>
                      )}
                    </div>
                    {b.phone && (
                      <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 2 }}>
                        {b.phone}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: st.bg, color: st.color, flexShrink: 0, marginLeft: 8,
                  }}>
                    {st.label}
                  </span>
                </div>

                {/* Check-in button */}
                {canCheckIn && (
                  <button
                    disabled={isPending}
                    onClick={() => handleCheckIn(b.id, b.studentName)}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 10,
                      border: 'none', background: ACCENT, color: '#fff',
                      fontSize: 13, fontWeight: 700, fontFamily: 'Syne, sans-serif',
                      cursor: 'pointer', marginTop: 4,
                      opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {isPending ? 'Processing…' : '✓ Mark Checked In'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeUp {
          from { opacity:0; transform:translateX(-50%) translateY(8px) }
          to   { opacity:1; transform:translateX(-50%) translateY(0) }
        }
      `}} />
    </div>
  )
}

/* ─── Slot tab button ─────────────────────────────────────────────────────── */

function SlotTab({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  const ACCENT       = '#0597A7'
  const ACCENT_LIGHT = '#E0F6F8'
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '5px 12px',
        borderRadius: 20,
        fontSize:     11,
        fontWeight:   600,
        border:       `1.5px solid ${active ? ACCENT : '#E2DDD4'}`,
        background:   active ? ACCENT_LIGHT : '#FDFCF9',
        color:        active ? ACCENT : '#6B7689',
        cursor:       'pointer',
        whiteSpace:   'nowrap',
        fontFamily:   'DM Sans, sans-serif',
        flexShrink:   0,
      }}
    >
      {label}
    </button>
  )
}