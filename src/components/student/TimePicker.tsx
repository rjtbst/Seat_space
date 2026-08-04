// src/components/student/TimePicker.tsx
'use client'

/**
 * Shared hour/minute/AM-PM picker for student booking flows.
 *
 * This used to be TWO independent copies — one in BookSeatClient.tsx, one
 * in LibraryDetail.tsx. Both started from the same free-text minute input
 * (hard to use — no scroll/select, had to type digits), which got fixed
 * to a proper <select> in BookSeatClient.tsx's copy but never touched in
 * LibraryDetail.tsx's, since nothing forced the two to change together.
 * Same duplication pattern that caused a real booking-logic bug earlier in
 * this project (see services/booking/createManualBooking.ts's doc comment)
 * — this time it was a UI component instead of business logic, but the
 * fix is the same: one copy, not two.
 *
 * Minute stays a full 0-59 range (not restricted to quarter-hours) — the
 * backend (slotBoundaryValidation.ts) already accepts any minute value.
 */

import { timeToMinutes } from '@/lib/booking/types'

function minsToHHMM(mins: number): string {
  const clamped = Math.min(mins, 23 * 60 + 59)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

export interface TimePickerProps {
  value:      string
  onChange:   (v: string) => void
  minMins?:   number
  maxMins?:   number
  disabled?:  boolean
  label?:     string   // rendered above the picker when provided
  id?:        string
  /** 'filled' = light-grey background (matches LibraryDetail's booking card),
      'plain' = white background (matches BookSeatClient's full-page flow).
      Purely visual — same behavior either way. */
  variant?:   'filled' | 'plain'
}

export function TimePicker({
  value, onChange, minMins, maxMins, disabled, label, id, variant = 'plain',
}: TimePickerProps) {
  const totalMins = value ? timeToMinutes(value) : 0
  const h24  = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  const isPM = h24 >= 12
  const h12  = h24 % 12 || 12

  function emit(newH24: number, newMins: number) {
    onChange(minsToHHMM(newH24 * 60 + newMins))
  }

  function handleHour(h: number) {
    emit((h % 12) + (isPM ? 12 : 0), mins)
  }

  function handleMinute(m: number) {
    emit(h24, m)
  }

  function handlePeriod(period: 'AM' | 'PM') {
    emit((h12 % 12) + (period === 'PM' ? 12 : 0), mins)
  }

  const selCls = [
     'clay-input px-2 py-2',
    'text-[10px] font-semibold text-[#0D1117] outline-none',
    'transition-shadow',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  ].join(' ')
  const minuteSelCls = [selCls, 'tabular-nums'].join(' ')

  function isHourDisabled(h: number) {
    if (minMins === undefined && maxMins === undefined) return false
    const h24test = (h % 12) + (isPM ? 12 : 0)
    const loMins  = h24test * 60
    const hiMins  = h24test * 60 + 59
    if (minMins !== undefined && hiMins < minMins) return true
    if (maxMins !== undefined && loMins > maxMins) return true
    return false
  }

  // Mirrors isHourDisabled, so a student can't land on an out-of-range
  // minute within an otherwise-valid hour.
  function isMinuteDisabled(m: number) {
    if (minMins === undefined && maxMins === undefined) return false
    const totalTest = h24 * 60 + m
    if (minMins !== undefined && totalTest < minMins) return true
    if (maxMins !== undefined && totalTest > maxMins) return true
    return false
  }

  const picker = (
    <div className="flex items-center gap-1 min-w-0">
      <select
        value={h12}
        disabled={disabled}
        onChange={e => handleHour(Number(e.target.value))}
        className={selCls}
        aria-label="Hour"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
          <option  key={h} value={h} disabled={isHourDisabled(h)}>{h}</option>
        ))}
      </select>

      <span className="text-[#9AACBE] font-bold text-[12px] flex-shrink-0">:</span>

      <select
        value={mins}
        disabled={disabled}
        onChange={e => handleMinute(Number(e.target.value))}
        className={minuteSelCls}
        aria-label="Minute"
      >
        {Array.from({ length: 60 }, (_, m) => m).map(m => (
          <option key={m} value={m} disabled={isMinuteDisabled(m)}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>

      <select
        value={isPM ? 'PM' : 'AM'}
        disabled={disabled}
        onChange={e => handlePeriod(e.target.value as 'AM' | 'PM')}
        className={selCls}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )

  if (!label) return <div id={id}>{picker}</div>

  return (
    <div id={id} className="min-w-0">
      <label className="text-[11px] font-semibold text-[#6E7F94] uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      {picker}
    </div>
  )
}
