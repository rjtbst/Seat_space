'use client'

// src/components/staff/StaffSeatManagerClient.tsx

import { useState, useTransition, useCallback } from 'react'
import type { SeniorSeatRow } from '@/lib/actions/staff-seat-actions'
import {
  seniorToggleSeatActive,
  seniorAddSeatRow,
  seniorManualBook,
  seniorForceFree,
  getSeniorSeatLayout,
} from '@/lib/actions/staff-seat-actions'
import {
  toISTInputValue,
  inputToDB,
  fmtIST,
  fmtInputPreview,
  validateISTRange,
} from '@/lib/ist'
import { useSeatLayoutRealtime } from '@/hooks/useSeatLayoutRealtime'

/* ─── Colors — staff teal palette (matches WalkInClient / StaffBookingsClient) */
const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const BLUE         = '#1E5CFF'
const BLUE_LIGHT   = '#E8EFFE'
const RED          = '#DC2626'
const RED_LIGHT    = '#FEE2E2'

const SEAT_COLORS: Record<string, { bg: string; border: string; color: string; label: string }> = {
  free:     { bg: '#F0FDFE',  border: '#67E8F9', color: ACCENT,    label: 'Free'     },
  booked:   { bg: BLUE_LIGHT, border: '#93C5FD', color: BLUE,      label: 'Booked'   },
  held:     { bg: '#FEF3E2',  border: '#FCD34D', color: '#92400E', label: 'Held'     },
  inactive: { bg: '#F4F7FB',  border: '#E2DDD4', color: '#9AAAB8', label: 'Inactive' },
}

function defaultTimes() {
  const now = new Date()
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return { start: toISTInputValue(now), end: toISTInputValue(end) }
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function StaffSeatManagerClient({
  seats: initial,
  libraryId,
  libraryName,
}: {
  seats:       SeniorSeatRow[]
  libraryId:   string
  libraryName: string
}) {
  const [seats, setSeats]             = useState(initial)
  const [selected, setSelected]       = useState<SeniorSeatRow | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [showAddRow, setShowAddRow]   = useState(false)
  const [newRowLabel, setNewRowLabel] = useState('')
  const [newRowCols, setNewRowCols]   = useState(8)
  const [toast, setToast]             = useState('')
  const [confirmForceFree, setConfirmForceFree] = useState(false)

  const [bookForm, setBookForm] = useState({
    userName:    '',
    userPhone:   '',
    ...defaultTimes(),
    bookingMode: 'offline' as 'online' | 'offline',
    amountPaid:  '',
    paymentMode: 'cash' as 'cash' | 'upi' | 'other',
    paymentNote: '',
  })

  const rows = Array.from(new Set(seats.map(s => s.row_label))).sort()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const resetForm = () =>
    setBookForm({
      userName: '', userPhone: '', ...defaultTimes(),
      bookingMode: 'offline',
      amountPaid: '', paymentMode: 'cash', paymentNote: '',
    })

  /* ── Stats ───────────────────────────────────────────────────────────── */
  const active   = seats.filter(s => s.is_active).length
  const booked   = seats.filter(s => s.live_status === 'booked').length
  const inactive = seats.filter(s => !s.is_active).length

  /* ── Realtime: live seat status across multiple staff/owner terminals
   * viewing the same library at once. Any insert/update/delete on
   * `bookings` for this library triggers a fresh getSeniorSeatLayout()
   * fetch — e.g. a student's online booking, another terminal's check-in,
   * or an owner force-freeing a seat all show up here without a manual
   * page refresh. See hooks/useSeatLayoutRealtime.ts for why this
   * re-fetches rather than patching the changed row directly. */
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshSeats = useCallback(() => {
    getSeniorSeatLayout(libraryId).then((fresh) => {
      setSeats(fresh)
      // Keep the open side panel in sync if it's showing the seat that
      // just changed, without auto-closing it on the staff member.
      setSelected((prevSelected) => {
        if (!prevSelected) return null
        return fresh.find((s) => s.id === prevSelected.id) ?? prevSelected
      })
    })
  }, [libraryId])

  // Manual refresh button — same refetch the realtime hook uses, but
  // user-triggered for a quick "let me check right now" moment.
  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true)
    getSeniorSeatLayout(libraryId).then((fresh) => {
      setSeats(fresh)
      setSelected((prevSelected) => {
        if (!prevSelected) return null
        return fresh.find((s) => s.id === prevSelected.id) ?? prevSelected
      })
      setIsRefreshing(false)
    })
  }, [libraryId])

  useSeatLayoutRealtime(libraryId, refreshSeats)

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const handleToggle = () => {
    if (!selected) return
    const newVal = !selected.is_active
    startTransition(async () => {
      const res = await seniorToggleSeatActive(selected.id, libraryId, newVal)
      if (res.success) {
        const updated: SeniorSeatRow = {
          ...selected,
          is_active:   newVal,
          live_status: newVal ? 'free' : 'inactive',
        }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        showToast(`Seat ${selected.row_label}${selected.column_number} ${newVal ? 'activated' : 'deactivated'}`)
      } else {
        showToast((res as any).error ?? 'Toggle failed')
      }
    })
  }

  const handleManualBook = () => {
    if (!selected) return
    const { userName, userPhone, start, end, bookingMode, amountPaid, paymentMode, paymentNote } = bookForm

    if (!userName.trim()) { showToast('Student name is required'); return }
    if (userPhone.replace(/\D/g, '').length < 10) { showToast('Enter a valid 10-digit phone'); return }

    const startDB = inputToDB(start)
    const endDB   = inputToDB(end)

    const parsedAmount = amountPaid ? parseFloat(amountPaid) : 0
    if (amountPaid && isNaN(parsedAmount)) { showToast('Enter a valid amount'); return }

    startTransition(async () => {
      const res = await seniorManualBook({
        seatId:      selected.id,
        libraryId,
        userName:    userName.trim(),
        userPhone:   userPhone.trim(),
        startTime:   startDB,
        endTime:     endDB,
        bookingMode,
        amountPaid:  parsedAmount,
        paymentMode,
        paymentNote: paymentNote.trim(),
      })
      if (res.success) {
        const updated: SeniorSeatRow = { ...selected, live_status: 'booked' }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        resetForm()
        const payStr = parsedAmount > 0 ? ` · ₹${parsedAmount} ${paymentMode}` : ''
        showToast(`Seat ${selected.row_label}${selected.column_number} booked for ${userName}${payStr}`)
      } else {
        showToast((res as any).error ?? 'Booking failed')
      }
    })
  }

  const handleForceFree = () => {
    if (!selected) return
    startTransition(async () => {
      const res = await seniorForceFree(selected.id, libraryId)
      if (res.success) {
        const updated: SeniorSeatRow = { ...selected, live_status: 'free', current_booking: undefined }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        setConfirmForceFree(false)
        showToast(`Seat ${selected.row_label}${selected.column_number} cleared`)
      } else {
        showToast((res as any).error ?? 'Failed to clear seat')
        setConfirmForceFree(false)
      }
    })
  }

  const handleAddRow = () => {
    if (!newRowLabel.trim()) return
    startTransition(async () => {
      const res = await seniorAddSeatRow(libraryId, newRowLabel, newRowCols)
      if (res.success) {
        showToast(`Row ${newRowLabel.toUpperCase()} added`)
        setShowAddRow(false)
        setNewRowLabel('')
        // Re-fetch seat layout to show newly inserted seats immediately
        refreshSeats()
      } else {
        showToast((res as any).error ?? 'Failed to add row')
      }
    })
  }

  /* ── Shared input style ──────────────────────────────────────────────── */
  const inp: React.CSSProperties = {
    padding: '9px 12px', border: '1.5px solid #E2DDD4', borderRadius: 9,
    fontSize: 13, color: '#0A0D12', outline: 'none', width: '100%',
    fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
    boxSizing: 'border-box',
  }
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '20px 16px', maxWidth: 680, margin: '0 auto' }}>

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
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 16, gap: 10,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22,
            color: '#0A0D12', letterSpacing: '-0.03em', margin: 0, marginBottom: 2,
          }}>
            Seat Manager
          </h1>
          <div style={{ fontSize: 12, color: '#9AAAB8' }}>
            {libraryName} · {seats.length} seats · IST
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="press"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh seat status"
            style={{
              width: 38, height: 38, borderRadius: 9,
              border: '1.5px solid #E2DDD4', background: '#FDFCF9',
              cursor: isRefreshing ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#3A4A5C',
              opacity: isRefreshing ? 0.6 : 1,
            }}
          >
            <span style={{
              display: 'inline-block',
              animation: isRefreshing ? 'spin .7s linear infinite' : 'none',
            }}>
              ↻
            </span>
          </button>
          <button className="press"
            onClick={() => setShowAddRow(v => !v)}
            style={{
              padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: '1.5px solid #E2DDD4', background: '#FDFCF9', color: '#3A4A5C',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0,
            }}
          >
            + Add Row
          </button>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />

      {/* Info banner */}
      <div style={{
        background: ACCENT_LIGHT, border: `1px solid rgba(5,151,167,.25)`,
        borderRadius: 12, padding: '10px 14px', marginBottom: 14,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <span>💡</span>
        <span style={{ fontSize: 12, color: '#0A6B78' }}>
          Tap any seat to select · All times are IST (Asia/Kolkata)
        </span>
      </div>

      {/* Floor grid */}
      <div style={{
        background: '#FDFCF9', border: '1px solid #E2DDD4',
        borderRadius: 14, overflow: 'hidden', marginBottom: 14,
        boxShadow: '0 2px 8px rgba(10,13,18,.04)',
      }}>
        {/* Grid header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid #E2DDD4',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12' }}>Floor Layout</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: `${active} active`,  bg: ACCENT_LIGHT, color: ACCENT    },
              { label: `${booked} booked`,  bg: BLUE_LIGHT,   color: BLUE      },
              { label: `${inactive} off`,   bg: '#F4F7FB',    color: '#9AAAB8' },
            ].map(({ label, bg, color }) => (
              <span key={label} style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 10,
                fontWeight: 600, background: bg, color,
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: 14, overflowX: 'auto' }}>
          {seats.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9AAAB8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💺</div>
              <div style={{ fontSize: 13 }}>No seats yet — add a row to get started</div>
            </div>
          ) : rows.map(row => {
            const rowSeats = seats
              .filter(s => s.row_label === row)
              .sort((a, b) => a.column_number - b.column_number)
            return (
              <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 5, background: '#F4F7FB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#6B7689', flexShrink: 0,
                }}>
                  {row}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {rowSeats.map((seat, idx) => {
                    const sc         = SEAT_COLORS[seat.live_status]
                    const isSelected = selected?.id === seat.id
                    return (
                      <div key={seat.id} style={{ display: 'flex', alignItems: 'center' }}>
                        {idx === 4 && <div style={{ width: 8 }} />}
                        <button className="press"
                          onClick={() => {
                            setSelected(seat.id === selected?.id ? null : seat)
                            setConfirmForceFree(false)
                            resetForm()
                          }}
                          style={{
                            width: 36, height: 36, borderRadius: 7,
                            background: sc.bg,
                            border: `2px solid ${isSelected ? '#0A0D12' : sc.border}`,
                            color: sc.color, fontSize: 9, fontWeight: 700,
                            cursor: 'pointer', transition: 'all .12s',
                            boxShadow: isSelected ? '0 0 0 3px rgba(5,151,167,.2)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {seat.row_label}{seat.column_number}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            {Object.entries(SEAT_COLORS).map(([key, sc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 11, height: 11, borderRadius: 3,
                  background: sc.bg, border: `1.5px solid ${sc.border}`,
                }} />
                <span style={{ fontSize: 10, color: '#6B7689' }}>{sc.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Seat editor ─────────────────────────────────────────────────── */}
      {selected && (
        <div style={{
          background: '#FDFCF9', border: '1px solid #E2DDD4',
          borderRadius: 14, padding: '16px', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(10,13,18,.04)',
          animation: 'slideUp .18s ease',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 14,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
              Seat {selected.row_label}{selected.column_number}
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11,
              fontWeight: 600, background: ACCENT_LIGHT, color: ACCENT,
            }}>
              Selected
            </span>
          </div>

          {/* Active toggle row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 0', borderBottom: '1px solid #E2DDD4',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3A4A5C' }}>
              Status:{' '}
              <span style={{ textTransform: 'capitalize', color: '#0A0D12' }}>
                {selected.live_status}
              </span>
            </div>

            {/* Toggle switch */}
            <button className="press"
              onClick={handleToggle}
              disabled={isPending}
              aria-label="Toggle seat active"
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none',
                background: selected.is_active ? ACCENT : '#C8D4C8',
                cursor: 'pointer', position: 'relative',
                transition: 'background .2s', marginLeft: 'auto',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: selected.is_active ? 21 : 3,
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              }} />
            </button>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: selected.is_active ? ACCENT : '#9AAAB8', flexShrink: 0,
            }}>
              {selected.is_active ? 'Active' : 'Inactive'}
            </span>
            <button className="press"
              onClick={() => { setSelected(null); setConfirmForceFree(false) }}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: '1.5px solid #E2DDD4', background: '#FDFCF9', color: '#6B7689',
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0,
              }}
            >
              Deselect
            </button>
          </div>

          {/* Current booking info */}
          {selected.current_booking && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: '#F9F8F5', borderRadius: 10,
              border: '1px solid #E2DDD4',
              fontSize: 12, color: '#3A4A5C', lineHeight: 1.8,
            }}>
              <strong>{selected.current_booking.guest_name ?? 'Member'}</strong>
              {selected.current_booking.guest_phone && (
                <span style={{ color: '#9AAAB8', marginLeft: 8 }}>
                  {selected.current_booking.guest_phone}
                </span>
              )}
              <br />
              📅 {fmtIST(selected.current_booking.start_time)} → {fmtIST(selected.current_booking.end_time)}
            </div>
          )}

          {/* ── Walk-in / Manual Booking (free seats) ───────────────────── */}
          {selected.live_status === 'free' && (
            <div style={{ marginTop: 14 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: '#0A0D12',
                marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>📋</span> Walk-in / Manual Booking
              </div>

              {/* Booking mode toggle */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 6 }}>
                  Booking Channel
                </div>
                <div style={{
                  display: 'flex', borderRadius: 9,
                  border: '1.5px solid #E2DDD4', overflow: 'hidden', width: 'fit-content',
                }}>
                  {(['offline', 'online'] as const).map(mode => (
                    <button className="press"
                      key={mode}
                      onClick={() => setBookForm(f => ({ ...f, bookingMode: mode }))}
                      style={{
                        padding: '7px 16px', fontSize: 12, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        background: bookForm.bookingMode === mode
                          ? (mode === 'offline' ? '#FEF3E2' : BLUE_LIGHT)
                          : '#FDFCF9',
                        color: bookForm.bookingMode === mode
                          ? (mode === 'offline' ? '#92400E' : BLUE)
                          : '#9AAAB8',
                        fontFamily: 'DM Sans, sans-serif',
                        borderRight: mode === 'offline' ? '1.5px solid #E2DDD4' : 'none',
                        transition: 'all .15s',
                      }}
                    >
                      {mode === 'offline' ? '🏪 Offline' : '🌐 Online'}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#9AAAB8', marginTop: 4 }}>
                  {bookForm.bookingMode === 'offline'
                    ? 'Student is physically present — payment collected in person'
                    : 'Student booked via app — payment already processed'}
                </div>
              </div>

              {/* Student details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                    Student name *
                  </div>
                  <input
                    value={bookForm.userName}
                    onChange={e => setBookForm(f => ({ ...f, userName: e.target.value }))}
                    placeholder="e.g. Rahul Sharma"
                    style={inp}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                    Phone number *
                  </div>
                  <input
                    value={bookForm.userPhone}
                    onChange={e => setBookForm(f => ({
                      ...f, userPhone: e.target.value.replace(/\D/g, '').slice(0, 10),
                    }))}
                    placeholder="10-digit mobile"
                    inputMode="numeric"
                    style={inp}
                  />
                </div>
              </div>

              {/* Times */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                    Start <span style={{ color: ACCENT, fontWeight: 700 }}>IST</span> *
                  </div>
                  <input
                    type="datetime-local"
                    value={bookForm.start}
                    onChange={e => setBookForm(f => ({ ...f, start: e.target.value }))}
                    style={inp}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                    End <span style={{ color: ACCENT, fontWeight: 700 }}>IST</span> *
                  </div>
                  <input
                    type="datetime-local"
                    value={bookForm.end}
                    onChange={e => setBookForm(f => ({ ...f, end: e.target.value }))}
                    style={inp}
                  />
                </div>
              </div>

              {/* Payment (offline only) */}
              {bookForm.bookingMode === 'offline' && (
                <div style={{
                  background: '#F9F8F5', border: '1px solid #E2DDD4',
                  borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: '#3A4A5C',
                    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    💵 Offline Payment{' '}
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#9AAAB8' }}>(optional)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Amount ₹</div>
                      <input
                        value={bookForm.amountPaid}
                        onChange={e => setBookForm(f => ({ ...f, amountPaid: e.target.value }))}
                        placeholder="0"
                        inputMode="decimal"
                        style={inp}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Mode</div>
                      <select
                        value={bookForm.paymentMode}
                        onChange={e => setBookForm(f => ({ ...f, paymentMode: e.target.value as any }))}
                        style={sel}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Note / UPI ref</div>
                      <input
                        value={bookForm.paymentNote}
                        onChange={e => setBookForm(f => ({ ...f, paymentNote: e.target.value }))}
                        placeholder="e.g. UPI ref 12345"
                        style={inp}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {bookForm.userName && bookForm.start && bookForm.end && (
                <div style={{
                  background: ACCENT_LIGHT, border: `1px solid rgba(5,151,167,.25)`,
                  borderRadius: 9, padding: '10px 12px', marginBottom: 10,
                  fontSize: 12, color: '#0A6B78', lineHeight: 1.7,
                }}>
                  <strong>{bookForm.userName}</strong> · Seat {selected.row_label}{selected.column_number}<br />
                  <span style={{ fontWeight: 600 }}>📅</span>{' '}
                  {fmtInputPreview(bookForm.start)} → {fmtInputPreview(bookForm.end)} IST<br />
                  <span style={{ fontWeight: 600 }}>
                    {bookForm.bookingMode === 'offline' ? '🏪 Offline' : '🌐 Online'}
                  </span>
                  {bookForm.bookingMode === 'offline' && bookForm.amountPaid && parseFloat(bookForm.amountPaid) > 0
                    ? ` · ₹${bookForm.amountPaid} via ${bookForm.paymentMode}`
                    : bookForm.bookingMode === 'offline' ? ' · No payment' : ''}
                </div>
              )}

              <button className="press"
                onClick={handleManualBook}
                disabled={isPending || !bookForm.userName || !bookForm.userPhone}
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, border: 'none',
                  background: bookForm.userName && bookForm.userPhone ? ACCENT : '#C8D4C8',
                  color: '#fff',
                  cursor: bookForm.userName && bookForm.userPhone ? 'pointer' : 'not-allowed',
                  fontFamily: 'Syne, sans-serif',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Booking…' : `Confirm — Seat ${selected.row_label}${selected.column_number}`}
              </button>
            </div>
          )}

          {/* ── Force Free (booked seats) ────────────────────────────────── */}
          {selected.live_status === 'booked' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2DDD4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0D12', marginBottom: 6 }}>
                🔓 Clear This Seat
              </div>
              <div style={{ fontSize: 12, color: '#6B7689', marginBottom: 10, lineHeight: 1.5 }}>
                Cancels the active booking and marks the seat as free. Payment record is kept for audit.
              </div>
              {!confirmForceFree ? (
                <button className="press"
                  onClick={() => setConfirmForceFree(true)}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 9,
                    fontSize: 13, fontWeight: 700,
                    border: `1.5px solid ${RED}`, background: RED_LIGHT,
                    color: RED, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Force Free Seat {selected.row_label}{selected.column_number}
                </button>
              ) : (
                <div style={{
                  background: RED_LIGHT, border: `1.5px solid ${RED}`,
                  borderRadius: 10, padding: '12px',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginBottom: 10 }}>
                    Are you sure? This will cancel the booking.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="press"
                      onClick={() => setConfirmForceFree(false)}
                      disabled={isPending}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12,
                        fontWeight: 600, border: '1.5px solid #E2DDD4',
                        background: '#fff', color: '#3A4A5C',
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      Cancel
                    </button>
                    <button className="press"
                      onClick={handleForceFree}
                      disabled={isPending}
                      style={{
                        flex: 2, padding: '8px 0', borderRadius: 8,
                        fontSize: 13, fontWeight: 700, border: 'none',
                        background: RED, color: '#fff',
                        cursor: 'pointer', fontFamily: 'Syne, sans-serif',
                        opacity: isPending ? 0.7 : 1,
                      }}
                    >
                      {isPending ? 'Clearing…' : 'Yes, Clear Seat'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Held notice ──────────────────────────────────────────────── */}
          {selected.live_status === 'held' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2DDD4' }}>
              <div style={{
                background: '#FEF3E2', border: '1px solid #FCD34D',
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⏳</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>
                    Seat held — checkout in progress
                  </div>
                  <div style={{ fontSize: 12, color: '#92400E', opacity: 0.85, lineHeight: 1.5 }}>
                    Hold expires automatically if payment isn't completed.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Inactive notice ───────────────────────────────────────────── */}
          {selected.live_status === 'inactive' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2DDD4' }}>
              <div style={{
                background: '#F4F7FB', border: '1px solid #E2DDD4',
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🚫</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3A4A5C', marginBottom: 2 }}>
                    Seat is inactive
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7689', lineHeight: 1.5 }}>
                    Toggle the switch above to re-activate and allow bookings.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add row panel ──────────────────────────────────────────────────── */}
      {showAddRow && (
        <div style={{
          background: '#FDFCF9', border: '1px solid #E2DDD4',
          borderRadius: 14, padding: '16px',
          boxShadow: '0 2px 8px rgba(10,13,18,.04)',
          animation: 'slideUp .18s ease',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0A0D12', marginBottom: 12 }}>
            Add New Row
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                Row label (A–Z)
              </div>
              <input
                value={newRowLabel}
                onChange={e => setNewRowLabel(e.target.value.slice(0, 1).toUpperCase())}
                placeholder="e.g. G"
                maxLength={1}
                style={inp}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                Number of seats
              </div>
              <input
                type="number"
                min={1}
                max={50}
                value={newRowCols}
                onChange={e => setNewRowCols(Number(e.target.value))}
                style={inp}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="press"
              onClick={() => { setShowAddRow(false); setNewRowLabel('') }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13,
                fontWeight: 600, border: '1.5px solid #E2DDD4',
                background: '#FDFCF9', color: '#3A4A5C',
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Cancel
            </button>
            <button className="press"
              onClick={handleAddRow}
              disabled={!newRowLabel || isPending}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 9, fontSize: 13,
                fontWeight: 700, border: 'none',
                background: newRowLabel ? ACCENT : '#C8D4C8',
                color: '#fff',
                cursor: newRowLabel ? 'pointer' : 'not-allowed',
                fontFamily: 'Syne, sans-serif',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Adding…' : `Add Row ${newRowLabel || '?'} (${newRowCols} seats)`}
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeUp {
          from { opacity:0; transform:translateX(-50%) translateY(8px) }
          to   { opacity:1; transform:translateX(-50%) translateY(0) }
        }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(8px) }
          to   { opacity:1; transform:none }
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { cursor:pointer; }
      `}} />
    </div>
  )
}