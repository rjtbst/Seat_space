// src/components/owner/seatManagerClient.tsx
'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SeatRow } from '@/lib/actions/owner'
import { toggleSeatActive, addSeatRow, manualBookSeat, forceFreeSeat, editSeatRow, getSeatLayout } from '@/lib/actions/owner'
import { findStudentForWalkIn, staffBookSeatViaSubscription, type WalkInStudentMatch } from '@/lib/actions/owner-staff'
import { toISTInputValue, inputToDB, fmtIST, fmtInputPreview } from '@/lib/ist'
import { useOwner } from '@/contexts/OwnerContext'
import { useToast } from '@/hooks/useToast'
import { useSeatLayoutRealtime } from '@/hooks/useSeatLayoutRealtime'
import {
  ACCENT, ACCENT_LIGHT, BLUE, BLUE_LIGHT, RED,
  BORDER, BG_CARD, SHADOW_SM,
  FONT_DISPLAY, FONT_BODY,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
  INP_STYLE,
} from '@/lib/constants/theme'
import { Card, PageHeader, Toast, LibraryPicker } from '@/components/owner/ui'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'

/* ─── Constants ───────────────────────────────────────────────────────────── */

const RED_LIGHT = '#FEE2E2'

const SEAT_COLORS: Record<string, { bg: string; border: string; color: string; label: string }> = {
  free:     { bg: '#F0FDF4',  border: '#86EFAC', color: ACCENT,    label: 'Free'     },
  booked:   { bg: BLUE_LIGHT, border: '#93C5FD', color: BLUE,      label: 'Booked'   },
  held:     { bg: '#FEF3E2',  border: '#FCD34D', color: '#92400E', label: 'Held'     },
  inactive: { bg: '#F4F7FB',  border: BORDER,    color: TEXT_MUTED, label: 'Inactive' },
}

const SEL_STYLE: React.CSSProperties = { ...INP_STYLE, cursor: 'pointer' }

/* ─── Default form times ─────────────────────────────────────────────────── */

function defaultTimes() {
  const now = new Date()
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return { start: toISTInputValue(now), end: toISTInputValue(end) }
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SeatManagerClient({
  seats: initial,
  libraryId,
  libraryName,
}: {
  seats:       SeatRow[]
  libraryId:   string
  libraryName: string
  // libraries prop removed — comes from useOwner() context
}) {
  const router              = useRouter()
  const { libraries }       = useOwner()
  const { toast, showToast } = useToast(3500)

  const [seats, setSeats]              = useState(initial)
  const [selected, setSelected]        = useState<SeatRow | null>(null)
  const [isPending, startTransition]   = useTransition()
  const [showAddRow, setShowAddRow]    = useState(false)
  const [newRowLabel, setNewRowLabel]  = useState('')
  const [newRowCols, setNewRowCols]    = useState(8)
  const [confirmForceFree, setConfirmForceFree] = useState(false)

  // Edit row state
  const [editingRow, setEditingRow]     = useState<string | null>(null)
  const [editRowLabel, setEditRowLabel] = useState('')
  const [editRowCount, setEditRowCount] = useState(8)

  const [bookForm, setBookForm] = useState({
    userName:    '',
    userPhone:   '',
    ...defaultTimes(),
    bookingMode: 'offline' as 'online' | 'offline',
    amountPaid:  '',
    paymentMode: 'cash' as 'cash' | 'upi' | 'other',
    paymentNote: '',
  })

  /* ── Membership check — same "look up a walk-in student's phone, book
     them free against an active subscription" flow as the staff walk-in
     desk (Walkinclient.tsx), reusing the exact same actions. The RPC
     underneath already accepts either an owner or staff caller, so no
     separate owner-specific copy of this logic exists. ── */
  const [membership, setMembership]           = useState<WalkInStudentMatch | null>(null)
  const [checkingPhone, setCheckingPhone]     = useState(false)
  const [membershipError, setMembershipError] = useState('')
  const [useSubId, setUseSubId]               = useState<string | null>(null)

  /* ── Derived state ────────────────────────────────────────────────────── */

  const rows = useMemo(
    () => Array.from(new Set(seats.map(s => s.row_label))).sort(),
    [seats],
  )

  const seatStats = useMemo(() => ({
    active:   seats.filter(s => s.is_active).length,
    booked:   seats.filter(s => s.live_status === 'booked').length,
    inactive: seats.filter(s => !s.is_active).length,
  }), [seats])

  /* ── Realtime: live seat status across multiple owners/staff viewing ───
   * the same library at once. Any insert/update/delete on `bookings` for
   * this library triggers a fresh getSeatLayout() fetch, so this view
   * reflects a student's online booking, another staff terminal's
   * check-in, etc. without a manual page refresh. See
   * hooks/useSeatLayoutRealtime.ts for why this re-fetches rather than
   * patching the changed row directly. */
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshSeats = useCallback(() => {
    getSeatLayout(libraryId).then((fresh) => {
      setSeats(fresh)
      // If the seat the owner currently has open in the side panel changed
      // (e.g. someone else just booked it), update the panel to match —
      // but don't auto-close it. The owner stays in control of dismissing
      // the panel; they just see accurate, current status while it's open.
      setSelected((prevSelected) => {
        if (!prevSelected) return null
        return fresh.find((s) => s.id === prevSelected.id) ?? prevSelected
      })
    })
  }, [libraryId])

  // Manual refresh button — same refetch as the realtime hook uses, but
  // user-triggered for the rare case someone wants to force a check right
  // now (e.g. right after telling a student over the phone "let me check
  // if that seat's free") without waiting for a realtime event.
  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true)
    getSeatLayout(libraryId).then((fresh) => {
      setSeats(fresh)
      setSelected((prevSelected) => {
        if (!prevSelected) return null
        return fresh.find((s) => s.id === prevSelected.id) ?? prevSelected
      })
      setIsRefreshing(false)
    })
  }, [libraryId])

  useSeatLayoutRealtime(libraryId, refreshSeats)

  /* ── Handlers ─────────────────────────────────────────────────────────── */

  const resetForm = useCallback(() => {
    setBookForm({
      userName: '', userPhone: '', ...defaultTimes(),
      bookingMode: 'offline', amountPaid: '', paymentMode: 'cash', paymentNote: '',
    })
    setMembership(null)
    setMembershipError('')
    setUseSubId(null)
  }, [])

  const handleCheckMembership = useCallback(() => {
    if (bookForm.userPhone.replace(/\D/g, '').length < 10) {
      setMembershipError('Enter a valid 10-digit phone first')
      return
    }
    setCheckingPhone(true)
    setMembershipError('')
    setMembership(null)
    setUseSubId(null)
    startTransition(async () => {
      const res = await findStudentForWalkIn(bookForm.userPhone, libraryId)
      setCheckingPhone(false)
      if (res.success === false) { setMembershipError(res.error); return }
      setMembership(res.data)
      if (res.data.subscriptions.length > 0) setUseSubId(res.data.subscriptions[0].id)
      setBookForm(f => ({ ...f, userName: f.userName || res.data.fullName }))
    })
  }, [bookForm.userPhone, libraryId])

  const handleBookWithSubscription = useCallback(() => {
    if (!selected || !membership || !useSubId) return
    const startDB = inputToDB(bookForm.start)
    const endDB   = inputToDB(bookForm.end)

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
        const updated = { ...selected, live_status: 'booked' as SeatRow['live_status'] }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        resetForm()
        showToast(`Seat ${selected.row_label}${selected.column_number} booked for ${membership.fullName} · membership`)
      } else {
        showToast((res as any).error ?? 'Booking failed')
      }
    })
  }, [selected, membership, useSubId, bookForm.start, bookForm.end, libraryId, showToast, resetForm])

  const handleToggle = useCallback(() => {
    if (!selected) return
    const newVal = !selected.is_active
    startTransition(async () => {
      const res = await toggleSeatActive(selected.id, libraryId, newVal)
      if (res.success) {
        const updated = {
          ...selected,
          is_active:   newVal,
          live_status: (newVal ? 'free' : 'inactive') as SeatRow['live_status'],
        }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        showToast(`Seat ${selected.row_label}${selected.column_number} ${newVal ? 'activated' : 'deactivated'}`)
      }
    })
  }, [selected, libraryId, showToast])

  const handleManualBook = useCallback(() => {
    if (!selected) return
    const { userName, userPhone, start, end, bookingMode, amountPaid, paymentMode, paymentNote } = bookForm

    if (!userName.trim())                                      { showToast('Student name is required'); return }
    if (userPhone.replace(/\D/g, '').length < 10)              { showToast('Enter a valid 10-digit phone number'); return }

    const startDB = inputToDB(start)
    const endDB   = inputToDB(end)
    const parsedAmount = amountPaid ? parseFloat(amountPaid) : 0
    if (amountPaid && isNaN(parsedAmount))                     { showToast('Enter a valid amount'); return }

    startTransition(async () => {
      const res = await manualBookSeat({
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
        const updated = { ...selected, live_status: 'booked' as SeatRow['live_status'] }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        resetForm()
        const payStr = parsedAmount > 0 ? ` · ₹${parsedAmount} ${paymentMode}` : ''
        showToast(`Seat ${selected.row_label}${selected.column_number} booked for ${userName}${payStr}`)
      } else {
        showToast((res as any).error ?? 'Booking failed')
      }
    })
  }, [selected, libraryId, bookForm, showToast, resetForm])

  const handleForceFree = useCallback(() => {
    if (!selected) return
    startTransition(async () => {
      const res = await forceFreeSeat(selected.id, libraryId)
      if (res.success) {
        const updated = { ...selected, live_status: 'free' as SeatRow['live_status'] }
        setSeats(prev => prev.map(s => s.id === selected.id ? updated : s))
        setSelected(updated)
        setConfirmForceFree(false)
        showToast(`Seat ${selected.row_label}${selected.column_number} cleared`)
      } else {
        showToast((res as any).error ?? 'Failed to clear seat')
        setConfirmForceFree(false)
      }
    })
  }, [selected, libraryId, showToast])

  const handleAddRow = useCallback(() => {
    if (!newRowLabel.trim()) return
    startTransition(async () => {
      const res = await addSeatRow(libraryId, newRowLabel, newRowCols)
      if (res.success) {
        showToast(`Row ${newRowLabel.toUpperCase()} added`)
        setShowAddRow(false)
        setNewRowLabel('')
        router.refresh()
      }
    })
  }, [libraryId, newRowLabel, newRowCols, showToast, router])

  const handleEditRow = useCallback(() => {
    if (!editingRow) return
    startTransition(async () => {
      const res = await editSeatRow(libraryId, editingRow, editRowLabel, editRowCount)
      if (res.success) {
        showToast(`Row ${editingRow} updated`)
        setEditingRow(null)
        router.refresh()
      } else {
        showToast((res as any).error ?? 'Update failed')
      }
    })
  }, [editingRow, editRowLabel, editRowCount, libraryId, showToast, router])

  const selectSeat = useCallback((seat: SeatRow) => {
    setSelected(s => s?.id === seat.id ? null : seat)
    setConfirmForceFree(false)
    resetForm()
  }, [resetForm])

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <Toast toast={toast} />

      {/* Header */}
      <PageHeader
        title="Seat Manager"
        subtitle={`${libraryName} · ${seats.length} seats · IST`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title="Refresh seat status"
              style={{
                width: 38, height: 38, borderRadius: 9,
                border: `1.5px solid ${BORDER}`, background: BG_CARD,
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
            <button
              onClick={() => setShowAddRow(v => !v)}
              style={{
                padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${BORDER}`, background: BG_CARD, color: '#3A4A5C',
                cursor: 'pointer', fontFamily: FONT_BODY,
              }}
            >
              {showAddRow ? '✕ Cancel' : '+ Add Row'}
            </button>
          </div>
        }
      />
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />

      {/* Library picker */}
      <LibraryPicker
        libraries={libraries}
        currentId={libraryId}
        buildHref={id => `/dashboard/seat-manager?lib=${id}`}
      />

      {/* Live stats pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: `${seatStats.active} active`,   bg: ACCENT_LIGHT, color: ACCENT    },
          { label: `${seatStats.booked} booked`,   bg: BLUE_LIGHT,   color: BLUE      },
          { label: `${seatStats.inactive} off`,    bg: '#F4F7FB',    color: TEXT_MUTED },
        ].map(({ label, bg, color }) => (
          <span key={label} style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color,
          }}>
            {label}
          </span>
        ))}
      </div>

      {/* Info banner */}
      <div style={{
        background: BLUE_LIGHT, border: `1px solid rgba(30,92,255,.2)`,
        borderRadius: 12, padding: '10px 14px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span>💡</span>
        <span style={{ fontSize: 13, color: '#1447D4' }}>
          Click any seat to select · Use ✏ edit next to a row to add/remove seats · All times are IST (Asia/Kolkata)
        </span>
      </div>

      {/* ── Floor grid ───────────────────────────────────────────────────── */}
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 18px', borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>Floor Layout</div>
        </div>

        <div style={{ padding: 16, overflowX: 'auto' }}>
          {seats.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: TEXT_MUTED }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💺</div>
              <div>No seats configured yet. Add a row to get started.</div>
            </div>
          ) : rows.map(row => {
            const rowSeats = seats
              .filter(s => s.row_label === row)
              .sort((a, b) => a.column_number - b.column_number)
            return (
              <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {/* Row label badge (static) */}
                <div style={{
                  width: 24, height: 24, borderRadius: 6, background: '#F4F7FB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: TEXT_SECONDARY, flexShrink: 0,
                }}>
                  {row}
                </div>

                {/* Edit row button */}
                <button
                  onClick={() => {
                    const count = seats.filter(s => s.row_label === row).length
                    setEditingRow(r => r === row ? null : row)
                    setEditRowLabel(row)
                    setEditRowCount(count)
                    setSelected(null)
                  }}
                  title={`Edit row ${row}`}
                  style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    border: `1.5px solid ${editingRow === row ? ACCENT : BORDER}`,
                    background: editingRow === row ? ACCENT_LIGHT : BG_CARD,
                    color: editingRow === row ? ACCENT : TEXT_MUTED,
                    cursor: 'pointer', flexShrink: 0, fontFamily: FONT_BODY,
                    transition: 'all .12s',
                  }}
                >
                  {editingRow === row ? '✕ close' : '✏ edit'}
                </button>

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {rowSeats.map((seat, idx) => {
                    const sc         = SEAT_COLORS[seat.live_status] ?? SEAT_COLORS.free
                    const isSelected = selected?.id === seat.id
                    return (
                      <div key={seat.id} style={{ display: 'flex', alignItems: 'center' }}>
                        {idx === 4 && <div style={{ width: 10 }} />}
                        <button
                          onClick={() => selectSeat(seat)}
                          style={{
                            width: 38, height: 38, borderRadius: 7,
                            background: sc.bg,
                            border: `2px solid ${isSelected ? TEXT_PRIMARY : sc.border}`,
                            color: sc.color, fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', transition: 'all .12s',
                            boxShadow: isSelected ? '0 0 0 3px rgba(10,13,18,.15)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: FONT_BODY,
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
          <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            {Object.entries(SEAT_COLORS).map(([key, sc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: sc.bg, border: `1.5px solid ${sc.border}` }} />
                <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>{sc.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Edit row panel ───────────────────────────────────────────────── */}
      {editingRow && (
        <Card padding="18px 20px" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
              Edit Row {editingRow}
            </div>
            <button
              onClick={() => setEditingRow(null)}
              style={{
                padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${BORDER}`, background: BG_CARD, color: TEXT_SECONDARY,
                cursor: 'pointer', fontFamily: FONT_BODY,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>
                Row label (A–Z)
              </div>
              <input
                value={editRowLabel}
                onChange={e => setEditRowLabel(e.target.value.slice(0, 1).toUpperCase())}
                placeholder="e.g. G"
                maxLength={1}
                style={INP_STYLE}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>
                Number of seats
                <span style={{ fontWeight: 400, color: TEXT_MUTED, marginLeft: 6 }}>
                  (currently {seats.filter(s => s.row_label === editingRow).length})
                </span>
              </div>
              <input
                type="number"
                min={1}
                max={50}
                value={editRowCount}
                onChange={e => setEditRowCount(Number(e.target.value))}
                style={INP_STYLE}
              />
            </div>
          </div>

          {/* Trim warning */}
          {editRowCount < seats.filter(s => s.row_label === editingRow).length && (
            <div style={{
              background: '#FEF3E2', border: '1px solid #FCD34D',
              borderRadius: 9, padding: '9px 13px', marginBottom: 12,
              fontSize: 12, color: '#92400E', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ flexShrink: 0 }}>⚠️</span>
              <span>
                Reducing from {seats.filter(s => s.row_label === editingRow).length} to {editRowCount} seats
                will <strong>permanently delete</strong> the last{' '}
                {seats.filter(s => s.row_label === editingRow).length - editRowCount} seat(s).
                Active bookings on those seats are not cancelled automatically.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditingRow(null)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${BORDER}`, background: BG_CARD, color: '#3A4A5C',
                cursor: 'pointer', fontFamily: FONT_BODY,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleEditRow}
              disabled={!editRowLabel || isPending}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 700,
                border: 'none',
                background: editRowLabel ? ACCENT : '#C8D4C8',
                color: '#fff',
                cursor: editRowLabel && !isPending ? 'pointer' : 'not-allowed',
                fontFamily: FONT_DISPLAY,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Saving…' : `Save Row ${editRowLabel || '?'}`}
            </button>
          </div>
        </Card>
      )}

      {/* ── Seat editor panel ────────────────────────────────────────────── */}
      {selected && (
        <Card padding="18px 20px" style={{ marginBottom: 16 }}>
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>
              Seat {selected.row_label}{selected.column_number}
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: BLUE_LIGHT, color: BLUE,
            }}>
              Selected
            </span>
          </div>

          {/* Status row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 0', borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3A4A5C' }}>
              Status: <span style={{ textTransform: 'capitalize', color: TEXT_PRIMARY }}>
                {selected.live_status}
              </span>
            </div>

            {/* Active toggle */}
            <button
              onClick={handleToggle}
              disabled={isPending}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none',
                background: selected.is_active ? ACCENT : '#C8D4C8',
                cursor: isPending ? 'not-allowed' : 'pointer',
                position: 'relative', transition: 'background .2s', marginLeft: 'auto',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3, left: selected.is_active ? 21 : 3,
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              }} />
            </button>
            <span style={{ fontSize: 13, color: selected.is_active ? ACCENT : TEXT_MUTED, fontWeight: 600 }}>
              {selected.is_active ? 'Active' : 'Inactive'}
            </span>

            <button
              onClick={() => setSelected(null)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${BORDER}`, background: BG_CARD, color: TEXT_SECONDARY,
                cursor: 'pointer', fontFamily: FONT_BODY,
              }}
            >
              Deselect
            </button>
          </div>

          {/* Current booking info (booked / held seats) */}
          {selected.current_booking && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: '#F9F8F5', borderRadius: 10, border: `1px solid ${BORDER}`,
              fontSize: 12, color: '#3A4A5C', lineHeight: 1.8,
            }}>
              <strong>{selected.current_booking.guest_name ?? 'Member'}</strong>
              {selected.current_booking.guest_phone && (
                <span style={{ color: TEXT_MUTED, marginLeft: 8 }}>{selected.current_booking.guest_phone}</span>
              )}
              <br />
              📅 {fmtIST(selected.current_booking.start_time)} → {fmtIST(selected.current_booking.end_time)}
            </div>
          )}

          {/* ── Walk-in / Manual Booking (free seats only) ──────────────── */}
          {selected.live_status === 'free' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📋</span> Walk-in / Manual Booking
              </div>

              {/* Booking channel toggle — irrelevant when booking via
                  subscription, since create_subscription_covered_booking
                  decides booking_mode itself based on who's calling it */}
              {!useSubId && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 6 }}>Booking Channel</div>
                <div style={{ display: 'flex', borderRadius: 9, border: `1.5px solid ${BORDER}`, overflow: 'hidden', width: 'fit-content' }}>
                  {(['offline', 'online'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setBookForm(f => ({ ...f, bookingMode: mode }))}
                      style={{
                        padding: '7px 20px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: bookForm.bookingMode === mode
                          ? (mode === 'offline' ? '#FEF3E2' : BLUE_LIGHT)
                          : BG_CARD,
                        color: bookForm.bookingMode === mode
                          ? (mode === 'offline' ? '#92400E' : BLUE)
                          : TEXT_MUTED,
                        fontFamily: FONT_BODY,
                        borderRight: mode === 'offline' ? `1.5px solid ${BORDER}` : 'none',
                        transition: 'all .15s',
                      }}
                    >
                      {mode === 'offline' ? '🏪 Offline / Walk-in' : '🌐 Online / App'}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 5 }}>
                  {bookForm.bookingMode === 'offline'
                    ? 'Student is physically present — payment collected in person'
                    : 'Student booked via app or online — payment already processed'}
                </div>
              </div>
              )}

              {/* Student details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Student name *</div>
                  <input
                    value={bookForm.userName}
                    onChange={e => setBookForm(f => ({ ...f, userName: e.target.value }))}
                    placeholder="e.g. Rahul Sharma"
                    style={INP_STYLE}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Phone number *</div>
                  <input
                    value={bookForm.userPhone}
                    onChange={e => {
                      setBookForm(f => ({ ...f, userPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))
                      setMembership(null)
                      setMembershipError('')
                      setUseSubId(null)
                    }}
                    placeholder="10-digit mobile"
                    inputMode="numeric"
                    style={INP_STYLE}
                  />
                </div>
              </div>

              <button
                onClick={handleCheckMembership}
                disabled={checkingPhone || bookForm.userPhone.length < 10}
                style={{
                  width: '100%', padding: '8px 10px', marginBottom: 10,
                  borderRadius: 8, border: `1.5px solid ${ACCENT}`, background: '#fff',
                  color: ACCENT, fontSize: 12, fontWeight: 700, fontFamily: FONT_BODY,
                  cursor: checkingPhone || bookForm.userPhone.length < 10 ? 'not-allowed' : 'pointer',
                  opacity: checkingPhone || bookForm.userPhone.length < 10 ? 0.5 : 1,
                }}
              >
                {checkingPhone ? 'Checking…' : '🎫 Check membership'}
              </button>

              {membershipError && (
                <div style={{ fontSize: 11.5, color: RED, marginBottom: 10 }}>{membershipError}</div>
              )}

              {membership && membership.subscriptions.length === 0 && (
                <div style={{ fontSize: 11.5, color: TEXT_SECONDARY, marginBottom: 10 }}>
                  {membership.fullName} has no active membership at this library — book as a walk-in below.
                </div>
              )}

              {membership && membership.subscriptions.length > 0 && (
                <div style={{
                  background: ACCENT_LIGHT, border: `1px solid ${ACCENT}`, borderRadius: 10,
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
                            🕐 Valid {restriction} only — book as a paid seat if this falls outside that
                          </div>
                        ) : null
                      })()}
                    </div>
                  </label>
                  {useSubId && membership.subscriptions.length > 1 && (
                    <select
                      value={useSubId}
                      onChange={e => setUseSubId(e.target.value)}
                      style={{ ...SEL_STYLE, marginTop: 8, fontSize: 12, padding: '7px 10px' }}
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

              {/* Time inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>
                    Start time <span style={{ color: ACCENT, fontWeight: 700 }}>IST</span> *
                  </div>
                  <input
                    type="datetime-local"
                    value={bookForm.start}
                    onChange={e => setBookForm(f => ({ ...f, start: e.target.value }))}
                    style={INP_STYLE}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>
                    End time <span style={{ color: ACCENT, fontWeight: 700 }}>IST</span> *
                  </div>
                  <input
                    type="datetime-local"
                    value={bookForm.end}
                    onChange={e => setBookForm(f => ({ ...f, end: e.target.value }))}
                    style={INP_STYLE}
                  />
                </div>
              </div>

              {/* Offline payment section */}
              {!useSubId && bookForm.bookingMode === 'offline' && (
                <div style={{
                  background: '#F9F8F5', border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#3A4A5C', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    💵 Offline Payment Received
                    <span style={{ fontSize: 10, fontWeight: 500, color: TEXT_MUTED }}>(optional)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Amount (₹)</div>
                      <input
                        value={bookForm.amountPaid}
                        onChange={e => setBookForm(f => ({ ...f, amountPaid: e.target.value }))}
                        placeholder="0"
                        inputMode="decimal"
                        style={INP_STYLE}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Mode</div>
                      <select
                        value={bookForm.paymentMode}
                        onChange={e => setBookForm(f => ({ ...f, paymentMode: e.target.value as any }))}
                        style={SEL_STYLE}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Note / UPI ref</div>
                      <input
                        value={bookForm.paymentNote}
                        onChange={e => setBookForm(f => ({ ...f, paymentNote: e.target.value }))}
                        placeholder="e.g. UPI ref 12345"
                        style={INP_STYLE}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Booking summary preview */}
              {bookForm.userName && bookForm.start && bookForm.end && (
                <div style={{
                  background: ACCENT_LIGHT, border: `1px solid rgba(13,124,84,.2)`,
                  borderRadius: 9, padding: '10px 14px', marginBottom: 12,
                  fontSize: 12, color: '#0A5E3F', lineHeight: 1.7,
                }}>
                  <strong>{bookForm.userName || '—'}</strong> · Seat {selected.row_label}{selected.column_number}<br />
                  <span style={{ fontWeight: 600 }}>📅</span> {fmtInputPreview(bookForm.start)} → {fmtInputPreview(bookForm.end)} IST
                  <br />
                  {useSubId ? (
                    <span style={{ fontWeight: 600 }}>🎫 Covered by membership</span>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600 }}>
                        {bookForm.bookingMode === 'offline' ? '🏪 Offline' : '🌐 Online'}
                      </span>
                      {bookForm.bookingMode === 'offline' && bookForm.amountPaid
                        ? ` · ₹${bookForm.amountPaid} via ${bookForm.paymentMode}`
                        : bookForm.bookingMode === 'offline' ? ' · No payment' : ''}
                    </>
                  )}
                </div>
              )}

              <button
                onClick={useSubId ? handleBookWithSubscription : handleManualBook}
                disabled={isPending || !bookForm.userName || !bookForm.userPhone}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 9,
                  fontSize: 13, fontWeight: 700, border: 'none',
                  background: !bookForm.userName || !bookForm.userPhone ? '#C8D4C8' : ACCENT,
                  color: '#fff',
                  cursor: bookForm.userName && bookForm.userPhone ? 'pointer' : 'not-allowed',
                  fontFamily: FONT_DISPLAY,
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending
                  ? 'Booking…'
                  : useSubId
                    ? `Book free — Seat ${selected.row_label}${selected.column_number}`
                    : `Confirm Booking — Seat ${selected.row_label}${selected.column_number}`}
              </button>
            </div>
          )}

          {/* ── Force-free (booked seats only) ──────────────────────────── */}
          {selected.live_status === 'booked' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>🔓 Clear This Seat</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 12, lineHeight: 1.5 }}>
                Cancels the active booking in DB and marks seat as free. Payment record is kept for audit.
              </div>
              {!confirmForceFree ? (
                <button
                  onClick={() => setConfirmForceFree(true)}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
                    border: `1.5px solid ${RED}`, background: RED_LIGHT, color: RED,
                    cursor: 'pointer', fontFamily: FONT_BODY,
                  }}
                >
                  Force Free Seat {selected.row_label}{selected.column_number}
                </button>
              ) : (
                <div style={{
                  background: RED_LIGHT, border: `1.5px solid ${RED}`,
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginBottom: 10 }}>
                    Are you sure? This will cancel the booking.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setConfirmForceFree(false)}
                      disabled={isPending}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${BORDER}`, background: '#fff', color: '#3A4A5C',
                        cursor: 'pointer', fontFamily: FONT_BODY,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleForceFree}
                      disabled={isPending}
                      style={{
                        flex: 2, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        border: 'none', background: RED, color: '#fff',
                        cursor: isPending ? 'not-allowed' : 'pointer',
                        fontFamily: FONT_DISPLAY, opacity: isPending ? 0.7 : 1,
                      }}
                    >
                      {isPending ? 'Clearing…' : 'Yes, Clear Seat'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Held notice ─────────────────────────────────────────────── */}
          {selected.live_status === 'held' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <div style={{
                background: '#FEF3E2', border: '1px solid #FCD34D',
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⏳</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>
                    Seat held — checkout in progress
                  </div>
                  <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, opacity: 0.85 }}>
                    A user is completing payment. Hold expires automatically if not paid.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Add row panel ────────────────────────────────────────────────── */}
      {showAddRow && (
        <Card padding="18px 20px">
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 14 }}>Add New Row</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Row label (A–Z)</div>
              <input
                value={newRowLabel}
                onChange={e => setNewRowLabel(e.target.value.slice(0, 1).toUpperCase())}
                placeholder="e.g. G"
                maxLength={1}
                style={INP_STYLE}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, marginBottom: 5 }}>Number of seats</div>
              <input
                type="number"
                min={1}
                max={20}
                value={newRowCols}
                onChange={e => setNewRowCols(Number(e.target.value))}
                style={INP_STYLE}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAddRow(false)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${BORDER}`, background: BG_CARD, color: '#3A4A5C',
                cursor: 'pointer', fontFamily: FONT_BODY,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAddRow}
              disabled={!newRowLabel || isPending}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 9, fontSize: 14, fontWeight: 700,
                border: 'none',
                background: newRowLabel ? ACCENT : '#C8D4C8',
                color: '#fff',
                cursor: newRowLabel ? 'pointer' : 'not-allowed',
                fontFamily: FONT_DISPLAY,
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Adding…' : `Add Row ${newRowLabel || '?'} (${newRowCols} seats)`}
            </button>
          </div>
        </Card>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { cursor: pointer; }
      `}} />
    </div>
  )
}