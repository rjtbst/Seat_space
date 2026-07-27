'use client'

// src/app/(staff)/staff/walk-in/_components/WalkInClient.tsx
import { useState, useTransition } from 'react'
import type { StaffSeatRow } from '@/lib/actions/staff'
import { staffWalkIn } from '@/lib/actions/staff'
import { findStudentForWalkIn, staffBookSeatViaSubscription, type WalkInStudentMatch } from '@/lib/actions/owner-staff'
import { toISTInputValue, inputToDB, fmtIST, fmtInputPreview, validateISTRange } from '@/lib/ist'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'
const GREEN        = '#0D7C54'
const GREEN_LIGHT  = '#D1FAE5'
const BLUE         = '#1E5CFF'
const BLUE_LIGHT   = '#E8EFFE'

const SEAT_COLORS = {
  free:     { bg: '#F0FDF4',  border: '#86EFAC', color: GREEN,    label: 'Free'     },
  booked:   { bg: BLUE_LIGHT, border: '#93C5FD', color: BLUE,     label: 'Booked'   },
  held:     { bg: '#FEF3E2',  border: '#FCD34D', color: '#92400E',label: 'Held'     },
  inactive: { bg: '#F4F7FB',  border: '#E2DDD4', color: '#9AAAB8',label: 'Inactive' },
}

function defaultTimes() {
  const now = new Date()
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return { start: toISTInputValue(now), end: toISTInputValue(end) }
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1.5px solid #E2DDD4', borderRadius: 9,
  fontSize: 13, color: '#0A0D12', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', background: '#FDFCF9',
  boxSizing: 'border-box',
}

export default function WalkInClient({
  seats: initial, libraryId, libraryName,
}: {
  seats:       StaffSeatRow[]
  libraryId:   string
  libraryName: string
}) {
  const [seats, setSeats]             = useState(initial)
  const [selected, setSelected]       = useState<StaffSeatRow | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [toast, setToast]             = useState('')

  /* ── Membership check — staff can look up a walk-in student's phone to
     see if they have an active subscription, and book them in against it
     for free instead of collecting a walk-in payment. ── */
  const [membership, setMembership]     = useState<WalkInStudentMatch | null>(null)
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [membershipError, setMembershipError] = useState('')
  const [useSubId, setUseSubId]         = useState<string | null>(null)

  const [form, setForm] = useState({
    guestName:   '',
    guestPhone:  '',
    ...defaultTimes(),
    amountPaid:  '',
    paymentMode: 'cash' as 'cash' | 'upi' | 'other',
  })

  const rows = [...new Set(seats.map(s => s.rowLabel))].sort()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const resetForm = () => {
    setForm({
      guestName: '', guestPhone: '', ...defaultTimes(),
      amountPaid: '', paymentMode: 'cash',
    })
    setMembership(null)
    setMembershipError('')
    setUseSubId(null)
  }

  const handleCheckMembership = () => {
    if (form.guestPhone.replace(/\D/g, '').length < 10) {
      setMembershipError('Enter a valid 10-digit phone first')
      return
    }
    setCheckingPhone(true)
    setMembershipError('')
    setMembership(null)
    setUseSubId(null)
    startTransition(async () => {
      const res = await findStudentForWalkIn(form.guestPhone, libraryId)
      setCheckingPhone(false)
      if (res.success === false) { setMembershipError(res.error); return }
      setMembership(res.data)
      if (res.data.subscriptions.length > 0) setUseSubId(res.data.subscriptions[0].id)
      // Prefill the name field from the registered account, so staff
      // doesn't have to retype it — still editable, this is just a
      // convenience default.
      setForm(f => ({ ...f, guestName: f.guestName || res.data.fullName }))
    })
  }

  const handleBookWithSubscription = () => {
    if (!selected || !membership || !useSubId) return
    const startDB = inputToDB(form.start)
    const endDB   = inputToDB(form.end)

    startTransition(async () => {
      const res = await staffBookSeatViaSubscription({
        studentUserId:  membership.userId,
        subscriptionId: useSubId,
        libraryId,
        seatId:         selected.id,
        startTime:      startDB,
        endTime:        endDB,
      })

      if (res.success) {
        const updated = { ...selected, liveStatus: 'booked' as StaffSeatRow['liveStatus'] }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(null)
        resetForm()
        showToast(`✓ Seat ${selected.rowLabel}${selected.colNumber} booked for ${membership.fullName} · membership`)
      } else {
        showToast((res as any).error ?? 'Booking failed')
      }
    })
  }

  const handleBook = () => {
    if (!selected) return
    const { guestName, guestPhone, start, end, amountPaid, paymentMode } = form

    if (!guestName.trim()) { showToast('Enter student name'); return }
    if (guestPhone.replace(/\D/g, '').length < 10) { showToast('Enter valid 10-digit phone'); return }

    const startDB = inputToDB(start)
    const endDB   = inputToDB(end)
    const check   = validateISTRange(startDB, endDB, 24)
    if (!check.ok) { console.log('Range check failed in staff') }

    const amount = amountPaid ? parseFloat(amountPaid) : 0
    if (amountPaid && isNaN(amount)) { showToast('Enter valid amount'); return }

    startTransition(async () => {
      const res = await staffWalkIn({
        seatId:      selected.id,
        libraryId,
        guestName:   guestName.trim(),
        guestPhone:  guestPhone.trim(),
        startTime:   startDB,
        endTime:     endDB,
        amountPaid:  amount,
        paymentMode,
      })

      if (res.success) {
        const updated = { ...selected, liveStatus: 'booked' as StaffSeatRow['liveStatus'] }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(null)
        resetForm()
        const payStr = amount > 0 ? ` · ₹${amount} ${paymentMode}` : ''
        showToast(`✓ Seat ${selected.rowLabel}${selected.colNumber} booked for ${guestName}${payStr}`)
      } else {
        showToast((res as any).error ?? 'Booking failed')
      }
    })
  }

  const freeCount   = seats.filter(s => s.liveStatus === 'free').length
  const bookedCount = seats.filter(s => s.liveStatus === 'booked').length

  return (
    <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: '#0A0D12', color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,.2)', whiteSpace: 'nowrap',
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
          Walk-in Desk
        </h1>
        <div style={{ fontSize: 12, color: '#9AAAB8' }}>
          {libraryName} · {freeCount} free · {bookedCount} occupied
        </div>
      </div>

      {/* Seat grid */}
      <div style={{
        background: '#FDFCF9', border: '1px solid #E2DDD4',
        borderRadius: 14, padding: '14px', marginBottom: 14,
        boxShadow: '0 2px 6px rgba(10,13,18,.04)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0A0D12', marginBottom: 12 }}>
          Floor Layout — tap a free seat
        </div>

        {seats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#9AAAB8', fontSize: 13 }}>
            No seats configured
          </div>
        ) : (
          <>
            {rows.map(row => {
              const rowSeats = seats.filter(s => s.rowLabel === row).sort((a, b) => a.colNumber - b.colNumber)
              return (
                <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: '#F4F7FB', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#6B7689', flexShrink: 0,
                  }}>
                    {row}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {rowSeats.map((seat, idx) => {
                      const sc         = SEAT_COLORS[seat.liveStatus]
                      const isSelected = selected?.id === seat.id
                      const isFree     = seat.liveStatus === 'free'
                      return (
                        <div key={seat.id} style={{ display: 'flex', alignItems: 'center' }}>
                          {idx === 4 && <div style={{ width: 6 }} />}
                          <button className="press"
                            onClick={() => {
                              if (!isFree) return
                              setSelected(seat.id === selected?.id ? null : seat)
                              resetForm()
                            }}
                            style={{
                              width:      34,
                              height:     34,
                              borderRadius: 6,
                              background: sc.bg,
                              border:     `2px solid ${isSelected ? '#0A0D12' : sc.border}`,
                              color:      sc.color,
                              fontSize:   9,
                              fontWeight: 700,
                              cursor:     isFree ? 'pointer' : 'default',
                              boxShadow:  isSelected ? '0 0 0 3px rgba(10,13,18,.15)' : 'none',
                              display:    'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all .1s',
                            }}
                          >
                            {seat.rowLabel}{seat.colNumber}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {Object.entries(SEAT_COLORS).map(([key, sc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: sc.bg, border: `1.5px solid ${sc.border}` }} />
                  <span style={{ fontSize: 10, color: '#6B7689' }}>{sc.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Booking form — shown when a free seat is selected */}
      {selected && (
        <div style={{
          background: '#FDFCF9', border: `1.5px solid ${ACCENT}`,
          borderRadius: 14, padding: '16px',
          boxShadow: `0 0 0 3px ${ACCENT_LIGHT}`,
          animation: 'slideUp .2s ease',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 14,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0A0D12', fontFamily: 'Syne, sans-serif' }}>
              Seat {selected.rowLabel}{selected.colNumber}
            </div>
            <button className="press"
              onClick={() => { setSelected(null); resetForm() }}
              style={{
                border: 'none', background: 'none', fontSize: 18,
                cursor: 'pointer', color: '#9AAAB8', padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>

          {/* Student info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Name *</div>
              <input
                value={form.guestName}
                onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))}
                placeholder="Rahul Sharma" style={inp} autoFocus
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Phone *</div>
              <input
                value={form.guestPhone}
                onChange={e => {
                  setForm(f => ({ ...f, guestPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))
                  setMembership(null)
                  setMembershipError('')
                  setUseSubId(null)
                }}
                placeholder="10-digit" inputMode="numeric" style={inp}
              />
            </div>
          </div>

          <button className="press"
            onClick={handleCheckMembership}
            disabled={checkingPhone || form.guestPhone.length < 10}
            style={{
              width: '100%', padding: '8px 10px', marginBottom: 10,
              borderRadius: 8, border: `1.5px solid ${GREEN}`, background: '#fff',
              color: GREEN, fontSize: 12, fontWeight: 700,
              cursor: checkingPhone || form.guestPhone.length < 10 ? 'not-allowed' : 'pointer',
              opacity: checkingPhone || form.guestPhone.length < 10 ? 0.5 : 1,
            }}
          >
            {checkingPhone ? 'Checking…' : '🎫 Check membership'}
          </button>

          {membershipError && (
            <div style={{ fontSize: 11.5, color: '#C5282C', marginBottom: 10 }}>{membershipError}</div>
          )}

          {membership && membership.subscriptions.length === 0 && (
            <div style={{ fontSize: 11.5, color: '#6B7689', marginBottom: 10 }}>
              {membership.fullName} has no active membership at this library — book as a paid walk-in below.
            </div>
          )}

          {membership && membership.subscriptions.length > 0 && (
            <div style={{
              background: GREEN_LIGHT, border: `1px solid ${GREEN}`, borderRadius: 10,
              padding: '10px 12px', marginBottom: 10,
            }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!useSubId}
                  onChange={e => setUseSubId(e.target.checked ? membership.subscriptions[0].id : null)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0A5C3E' }}>
                    Book free — {membership.fullName} has an active membership
                  </div>
                  {membership.subscriptions.length === 1 && (() => {
                    const s = membership.subscriptions[0]
                    const restriction = [
                      s.timeWindowStart && s.timeWindowEnd ? `${s.timeWindowStart.slice(0, 5)}–${s.timeWindowEnd.slice(0, 5)}` : null,
                      describeDaysOfWeek(s.daysOfWeek),
                    ].filter(Boolean).join(' · ')
                    return restriction ? (
                      <div style={{ fontSize: 10.5, color: '#92400E', fontWeight: 600, marginTop: 2 }}>
                        🕐 Valid {restriction} only — book as a paid seat if this walk-in falls outside that
                      </div>
                    ) : null
                  })()}
                </div>
              </label>
              {useSubId && membership.subscriptions.length > 1 && (
                <select
                  value={useSubId}
                  onChange={e => setUseSubId(e.target.value)}
                  style={{ ...inp, marginTop: 8, fontSize: 12, padding: '7px 10px' }}
                >
                  {membership.subscriptions.map(s => {
                    const restriction = [
                      s.timeWindowStart && s.timeWindowEnd ? `${s.timeWindowStart.slice(0, 5)}–${s.timeWindowEnd.slice(0, 5)}` : null,
                      describeDaysOfWeek(s.daysOfWeek),
                    ].filter(Boolean).join(' · ')
                    return (
                      <option key={s.id} value={s.id}>
                        {s.planName} ({s.sessionsLimit === null ? 'unlimited' : `${s.sessionsUsed}/${s.sessionsLimit} used`}){restriction ? ` — ${restriction} only` : ''}
                      </option>
                    )
                  })}
                </select>
              )}
            </div>
          )}

          {/* Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                Start <span style={{ color: ACCENT }}>IST</span> *
              </div>
              <input
                type="datetime-local"
                value={form.start}
                onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                style={inp}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>
                End <span style={{ color: ACCENT }}>IST</span> *
              </div>
              <input
                type="datetime-local"
                value={form.end}
                onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                style={inp}
              />
            </div>
          </div>

          {/* Payment — hidden when booking free against a membership */}
          {!useSubId && (
            <div style={{
              background: '#F9F8F5', border: '1px solid #E2DDD4',
              borderRadius: 10, padding: '10px 12px', marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#3A4A5C', marginBottom: 8 }}>
                💵 Payment <span style={{ color: '#9AAAB8', fontWeight: 400 }}>(optional)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Amount ₹</div>
                  <input
                    value={form.amountPaid}
                    onChange={e => setForm(f => ({ ...f, amountPaid: e.target.value }))}
                    placeholder="0" inputMode="decimal" style={inp}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7689', marginBottom: 4 }}>Mode</div>
                  <select
                    value={form.paymentMode}
                    onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value as any }))}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {form.guestName && form.start && form.end && (
            <div style={{
              background: GREEN_LIGHT, border: '1px solid rgba(13,124,84,.2)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10,
              fontSize: 11, color: '#0A5E3F', lineHeight: 1.7,
            }}>
              <strong>{form.guestName}</strong> · Seat {selected.rowLabel}{selected.colNumber}<br />
              📅 {fmtInputPreview(form.start)} → {fmtInputPreview(form.end)} IST
              {useSubId
                ? ' · covered by membership'
                : form.amountPaid && parseFloat(form.amountPaid) > 0
                  ? ` · ₹${form.amountPaid} ${form.paymentMode}`
                  : ''}
            </div>
          )}

          <button className="press"
            onClick={useSubId ? handleBookWithSubscription : handleBook}
            disabled={isPending || !form.guestName || !form.guestPhone}
            style={{
              width:      '100%',
              padding:    '12px 0',
              borderRadius: 10,
              border:     'none',
              background: !form.guestName || !form.guestPhone ? '#C8D4C8' : useSubId ? GREEN : ACCENT,
              color:      '#fff',
              fontSize:   14,
              fontWeight: 700,
              fontFamily: 'Syne, sans-serif',
              cursor:     form.guestName && form.guestPhone ? 'pointer' : 'not-allowed',
              opacity:    isPending ? 0.7 : 1,
            }}
          >
            {isPending
              ? 'Booking…'
              : useSubId
                ? `Book free — Seat ${selected.rowLabel}${selected.colNumber}`
                : `Confirm — Seat ${selected.rowLabel}${selected.colNumber}`}
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { cursor:pointer; }
      `}} />
    </div>
  )
}