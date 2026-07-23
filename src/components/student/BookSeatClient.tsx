// components/student/BookSeatClient.tsx
'use client'

/**
 * Three-step student booking flow.
 *
 * Step 1 — Pick a slot + set start/end time (live price preview).
 * Step 2 — Choose a seat from the real SeatGrid (live realtime, auto-refreshes
 *           when any booking changes for this library).
 * Step 3 — Confirm summary → Razorpay checkout → confirmBookingPayment.
 *
 *  */

import { useState, useCallback, useTransition, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  Calendar,
  MapPin,
  AlertCircle,
  Loader2,
  Tag,
  CreditCard,
  Armchair,
} from 'lucide-react'
import SeatGrid from './SeatGrid'
import { useRazorpay } from '@/hooks/userazorpay'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  getBookingPricePreview,
  getSeatAvailability,
  type SeatAvailability,
} from '@/lib/actions/students/student-discovery'
import {
  initiateBooking,
  confirmBookingPayment,
} from '@/lib/actions/students/student-bookings'
import {
  getEligibleSubscriptionsForLibrary,
  bookSeatViaSubscription,
  type EligibleSubscription,
} from '@/lib/actions/students/student-subscription-booking'
import { isWithinPlanTimeWindow, isWithinPlanDaysOfWeek, describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'
import type { StudentProfile } from '@/lib/actions/students/student-profile'
import {
  type SlotConfig,
  daysDisplay,
  effectiveSlotRate,
  formatTime12h,
  timeToMinutes,
} from '@/lib/booking/types'
import { type LibraryStatus } from '@/lib/booking/libraryStatus'

/* ─────────────────────────────────────────────────────────────────────────
   Prop types
───────────────────────────────────────────────────────────────────────── */

interface LibrarySummary {
  id:        string
  name:      string
  city:      string
  area:      string
  address:   string
  rating:    number
  cover_url: string | null
  freeSeats: number
  status:    LibraryStatus
}

interface Props {
  library:             LibrarySummary
  slots:               SlotConfig[]         // active slots only
  profile:             StudentProfile | null
  preselectedSlotId:   string | null
}

/* ─────────────────────────────────────────────────────────────────────────
   Local helpers
───────────────────────────────────────────────────────────────────────── */

/** Format "HH:MM" (24h) → "9:00 AM" */
function fmt12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number)
  const a      = h >= 12 ? 'PM' : 'AM'
  const h12    = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${a}`
}

/** "YYYY-MM-DDTHH:mm" → "Mon, 16 Jun 2025" */
function fmtDate(val: string): string {
  const datePart = val.slice(0, 10)
  try {
    return new Date(datePart + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return datePart
  }
}

/** Today's date in IST as "YYYY-MM-DD" */
function todayIST(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
}

/**
 * Slot end in minutes-since-midnight, treating "00:00" as END OF DAY (1440).
 * A slot stored as { start: "09:00", end: "00:00" } means "9 AM to midnight".
 */
function effectiveSlotEndMinutes(slot: SlotConfig): number {
  const endMins = timeToMinutes(slot.end)
  return endMins === 0 ? 1440 : endMins
}

/** Minutes → "HH:MM", clamped to 23:59 (can't represent 24:00 in an input). */
function minsToHHMM(mins: number): string {
  const clamped = Math.min(mins, 23 * 60 + 59)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/* ─────────────────────────────────────────────────────────────────────────
   AM/PM Time Picker
   Renders as Hour (1–12) + free-entry Minute (00–59) + AM/PM.
   Value in/out is "HH:MM" 24h format for compatibility with all other logic.
   Backend validation (slotBoundaryValidation.ts) already accepts any
   minute value — this picker used to artificially restrict input to
   :00/:15/:30/:45 via a <select>. Minute is now a free-typed numeric field
   so a student can pick e.g. 9:07 or 9:41, matching what the server allows.
───────────────────────────────────────────────────────────────────────── */

interface TimePickerProps {
  value:       string          // "HH:MM" 24h
  onChange:    (v: string) => void
  minMins?:    number          // minutes-since-midnight lower bound (inclusive)
  maxMins?:    number          // minutes-since-midnight upper bound (inclusive)
  disabled?:   boolean
  id?:         string
}

function TimePicker({ value, onChange, minMins, maxMins, disabled, id }: TimePickerProps) {
  const totalMins = value ? timeToMinutes(value) : 0
  const h24  = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  const isPM = h24 >= 12
  const h12  = h24 % 12 || 12

  function emit(newH24: number, newMins: number) {
    onChange(minsToHHMM(newH24 * 60 + newMins))
  }

  function handleHour(h: number) {
    const newH24 = (h % 12) + (isPM ? 12 : 0)
    emit(newH24, mins)
  }

  function handleMinute(m: number) {
    emit(h24, m)
  }

  function handlePeriod(period: 'AM' | 'PM') {
    const newH24 = (h12 % 12) + (period === 'PM' ? 12 : 0)
    emit(newH24, mins)
  }

  const selStyle = [
    'bg-white border border-[#DDE4EE] rounded-lg px-2 py-2 text-[13px] font-semibold',
    'text-[#0D1117] outline-none focus:border-[#1E5CFF] transition-colors',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  ].join(' ')

  const minuteSelStyle = [selStyle, 'tabular-nums'].join(' ')

  // Determine which hour options are within min/max bounds
  function isHourDisabled(h: number) {
    if (minMins === undefined && maxMins === undefined) return false
    const h24test = (h % 12) + (isPM ? 12 : 0)
    const loMins  = h24test * 60
    const hiMins  = h24test * 60 + 59
    if (minMins !== undefined && hiMins < minMins) return true
    if (maxMins !== undefined && loMins > maxMins) return true
    return false
  }

  // Determine which minute options are within min/max bounds, for the
  // currently-selected hour — mirrors isHourDisabled so a student can't
  // land on an out-of-range minute within an otherwise-valid hour.
  function isMinuteDisabled(m: number) {
    if (minMins === undefined && maxMins === undefined) return false
    const totalTest = h24 * 60 + m
    if (minMins !== undefined && totalTest < minMins) return true
    if (maxMins !== undefined && totalTest > maxMins) return true
    return false
  }

  return (
    <div className="flex items-center gap-1.5" id={id}>
      {/* Hour */}
      <select
        value={h12}
        disabled={disabled}
        onChange={e => handleHour(Number(e.target.value))}
        className={selStyle}
        aria-label="Hour"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
          <option key={h} value={h} disabled={isHourDisabled(h)}>
            {h}
          </option>
        ))}
      </select>

      <span className="text-[#9AACBE] font-bold text-[13px]">:</span>

      {/* Minute — full 00-59 range as a scrollable dropdown, matching the
          hour picker's interaction so both wheels behave the same way.
          Previously a free-text input, which meant "scroll to pick" only
          worked for the hour and not the minute — this was the reported
          UI bug. Every one of the 60 values stays selectable (no snapping
          to quarter-hours), so nothing about what a student CAN book
          changes, only how they pick it. */}
      <select
        value={mins}
        disabled={disabled}
        onChange={e => handleMinute(Number(e.target.value))}
        className={minuteSelStyle}
        aria-label="Minute"
      >
        {Array.from({ length: 60 }, (_, m) => m).map(m => (
          <option key={m} value={m} disabled={isMinuteDisabled(m)}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>

      {/* AM / PM */}
      <select
        value={isPM ? 'PM' : 'AM'}
        disabled={disabled}
        onChange={e => handlePeriod(e.target.value as 'AM' | 'PM')}
        className={selStyle}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Step indicator
───────────────────────────────────────────────────────────────────────── */

const STEP_LABELS = ['Slot & Time', 'Pick Seat', 'Confirm & Pay'] as const

function StepBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center px-4 py-3 bg-white border-b border-[#E4EAF2]">
      {STEP_LABELS.map((label, idx) => {
        const step = (idx + 1) as 1 | 2 | 3
        const done   = step < current
        const active = step === current
        return (
          <div key={step} className="flex items-center" style={{ flex: step < 3 ? 1 : undefined }}>
            <div className="flex items-center gap-1.5">
              <div
                className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                  done   ? 'bg-[#1E5CFF] text-white'
                  : active ? 'bg-[#1E5CFF] text-white shadow-[0_0_0_3px_rgba(30,92,255,0.2)]'
                  : 'bg-[#F4F7FB] text-[#9AACBE] border border-[#DDE4EE]',
                ].join(' ')}
              >
                {done ? <CheckCircle className="w-3.5 h-3.5" /> : step}
              </div>
              <span
                className={[
                  'text-[11px] font-medium whitespace-nowrap',
                  active ? 'text-[#1E5CFF]' : done ? 'text-[#6E7F94]' : 'text-[#9AACBE]',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {step < 3 && (
              <div
                className={[
                  'flex-1 h-px mx-2 transition-colors',
                  done ? 'bg-[#1E5CFF]' : 'bg-[#E4EAF2]',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Error box
───────────────────────────────────────────────────────────────────────── */

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-[#FFF0F0] border border-[#FCA5A5] rounded-xl px-3 py-2.5 text-[12px] text-[#C5282C]">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────────────────── */

export default function BookSeatClient({
  library,
  slots,
  profile,
  preselectedSlotId,
}: Props) {
  const router = useRouter()
  const { openCheckout } = useRazorpay()
  const [isPending, startTransition] = useTransition()

  /* ── Wizard state ── */
  const [step, setStep] = useState<1 | 2 | 3>(1)

  /* ── Step 1 state ── */
  const [selectedSlotId, setSelectedSlotId] = useState<string>(
    preselectedSlotId ?? slots[0]?.id ?? '',
  )
  const [selectedDate, setSelectedDate]   = useState<string>(todayIST())
  const [startTime, setStartTime]         = useState<string>('')   // "HH:MM"
  const [endTime, setEndTime]             = useState<string>('')   // "HH:MM"
  const [pricePreview, setPricePreview]   = useState<{ amount: number; platformFee: number; totalPayable: number; hourlyRate: number } | null>(null)
  const [step1Error, setStep1Error]       = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  /* ── Step 2 state ── */
  const [seats, setSeats]               = useState<SeatAvailability[]>([])
  const [seatsLoading, setSeatsLoading] = useState(false)
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
  const [step2Error, setStep2Error]     = useState<string>('')
  // Track the range for realtime re-fetch
  const step2RangeRef = useRef<{ startIST: string; endIST: string } | null>(null)

  /* ── Step 3 state ── */
  const [step3Error, setStep3Error]     = useState<string>('')
  const [payLoading, setPayLoading]     = useState(false)

  /* ── Subscription-covered booking ──────────────────────────────────────
     Fetched once per library — if the student has an active, non-expired
     subscription whose plan covers this library (and session_limit isn't
     already fully used), they can book without paying per-seat. Defaults
     to using the subscription when one is available, since that's almost
     always what a subscriber wants; they can switch back to "pay instead"
     if they'd rather save the session for later. */
  const [eligibleSubs, setEligibleSubs] = useState<EligibleSubscription[]>([])
  const [useSubId, setUseSubId]         = useState<string | null>(null)
  const [subLoading, setSubLoading]     = useState(false)

  useEffect(() => {
    let cancelled = false
    getEligibleSubscriptionsForLibrary(library.id).then(subs => {
      if (cancelled) return
      setEligibleSubs(subs)
    })
    return () => { cancelled = true }
  }, [library.id])

  // Time-windowed plans (e.g. a "9 to 12" morning-only membership) only
  // cover some of a student's bookings, not all of them — filter down to
  // subscriptions whose plan window actually covers the time currently
  // selected, so a plan that doesn't apply here is never even offered as
  // an option (rather than being offered and then rejected by the server
  // at confirm time). The real, unbypassable check is still the
  // create_subscription_covered_booking RPC; this is purely so the
  // student sees the right options as they change the time, not an error
  // after tapping Confirm.
  const subsForCurrentTime = useMemo(() => {
    if (!startTime || !endTime) return eligibleSubs
    const startDate = new Date(`${selectedDate}T00:00:00+05:30`)
    // A booking ending exactly at 00:00 ends on the NEXT calendar day —
    // same rule resolveServerRange() uses for the actual submission.
    // Using the start day's date for both start and end here would
    // silently disagree with the server for a day-of-week restricted
    // plan: the client would offer a "Fri-only" plan for a booking that
    // actually ends Saturday, then the server would correctly reject it
    // at confirm time.
    const endDate = endTime === '00:00' ? new Date(startDate.getTime() + 86_400_000) : startDate
    return eligibleSubs.filter(s =>
      isWithinPlanTimeWindow(s, startTime, endTime) &&
      isWithinPlanDaysOfWeek(s, startDate, endDate),
    )
  }, [eligibleSubs, startTime, endTime, selectedDate])

  useEffect(() => {
    if (subsForCurrentTime.length === 0) { setUseSubId(null); return }
    if (!useSubId || !subsForCurrentTime.some(s => s.id === useSubId)) {
      setUseSubId(subsForCurrentTime[0].id)
    }
  }, [subsForCurrentTime]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derived ── */
  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null
  const effectiveRate = selectedSlot ? effectiveSlotRate(selectedSlot) : 0
  const selectedSeat  = seats.find((s) => s.id === selectedSeatId) ?? null

  // Slot boundaries in minutes — midnight-aware
  const slotStartMins = selectedSlot ? timeToMinutes(selectedSlot.start) : 0
  const slotEndMins   = selectedSlot ? effectiveSlotEndMinutes(selectedSlot) : 24 * 60

  /* ─── Initialise start/end from slot defaults when slot changes ─── */
  useEffect(() => {
    if (!selectedSlot) return

    const nowIST  = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
    const nowDate = nowIST.slice(0, 10)
    const nowMins = (() => {
      const [, time] = nowIST.split(' ')
      const [h, m]   = time.split(':').map(Number)
      return h * 60 + m
    })()

    // Default start: now (rounded up to next 15 min) if we're inside the slot today,
    // otherwise slot start
    let defaultStartMins = slotStartMins
    if (selectedDate === nowDate && nowMins > slotStartMins && nowMins < slotEndMins) {
      defaultStartMins = Math.ceil(nowMins / 15) * 15
    }

    // Default end: start + 2h, capped at slot end
    let defaultEndMins = Math.min(defaultStartMins + 120, slotEndMins)

    // Guard: if the resulting window is < 60 min (e.g. we're near slot end),
    // back up start so user has at least a 60-min default window to work with.
    // validateTimes() requires 30 min minimum; 60 min gives comfortable headroom.
    if (defaultEndMins - defaultStartMins < 60) {
      defaultStartMins = Math.max(slotStartMins, defaultEndMins - 60)
    }

    // Final guard: if STILL can't fit 30 min (tiny slot), use slot boundaries
    if (defaultEndMins - defaultStartMins < 30) {
      defaultStartMins = slotStartMins
      defaultEndMins   = slotEndMins
    }

    const newStart = minsToHHMM(defaultStartMins)
    const newEnd   = minsToHHMM(defaultEndMins)

    setStartTime(newStart)
    setEndTime(newEnd)
    setStep1Error('')
    setPricePreview(null)

    // Auto-trigger price preview with default times so the CTA is ready on first load
    // Use setTimeout(0) to run after the state updates are batched and committed
    setTimeout(() => {
      refreshPreview(selectedSlot, selectedDate, newStart, newEnd)
    }, 0)
  }, [selectedSlotId, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Realtime: re-fetch seats while on Step 2 ─── */
  useEffect(() => {
    if (step !== 2) return

    const supabase = createBrowserSupabaseClient()
    const channel  = supabase
      .channel(`book-seat-avail-${library.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `library_id=eq.${library.id}` },
        (payload) => {
          const range = step2RangeRef.current
          if (!range) return

          // ── Skip irrelevant changes ──────────────────────────────────
          // Without this check, EVERY booking change anywhere in this
          // library (any seat, any day, any time slot) triggered a full
          // server-action re-fetch for every concurrently-browsing
          // student watching this library's seat grid — at a busy library
          // with high turnover, that's a lot of redundant round-trips for
          // changes that can't possibly affect what THIS viewer is looking
          // at. Only re-fetch if the changed row's time range actually
          // overlaps the viewer's currently selected window.
          const row = (payload.new ?? payload.old) as { start_time?: string; end_time?: string } | null
          if (row?.start_time && row?.end_time) {
            const changedStart = row.start_time
            const changedEnd   = row.end_time
            // Standard half-open interval overlap check: ranges overlap
            // unless one ends at or before the other starts.
            const overlaps = changedStart < range.endIST && changedEnd > range.startIST
            if (!overlaps) return
          }
          // If start_time/end_time weren't present on the payload for some
          // reason (defensive — shouldn't happen for this table), fall
          // back to the old always-refetch behavior rather than silently
          // missing a real update.

          // Re-fetch availability so a seat just taken by someone else goes red
          getSeatAvailability(library.id, range.startIST, range.endIST).then((fresh) => {
            setSeats(fresh)
            // If the seat the student selected was just taken, deselect it
            // and show a clear message so they pick another one
            setSelectedSeatId((prev) => {
              if (!prev) return null
              const stillAvail = fresh.find((s) => s.id === prev)?.is_available
              if (!stillAvail) {
                setStep2Error('Your selected seat was just taken. Please choose another seat.')
                return null
              }
              return prev
            })
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [step, library.id])

  /* ─── Client-side time validation ─── */
  const validateTimes = useCallback((
    slot: SlotConfig | null,
    date: string,
    start: string,
    end: string,
  ): string => {
    if (!slot) return 'Please select a slot'
    if (!start || !end) return 'Please set both start and end time'

    const startMins = timeToMinutes(start)
    let   endMins   = timeToMinutes(end)
    const slotStart = timeToMinutes(slot.start)
    const slotEnd   = effectiveSlotEndMinutes(slot)

    // "00:00" from the picker means midnight (end of day)
    if (endMins === 0) endMins = 1440

    if (endMins <= startMins)     return 'End time must be after start time'
    if (endMins - startMins < 30) return 'Minimum booking is 30 minutes'
    if (startMins < slotStart)    return `Start must be at or after ${formatTime12h(slot.start)} for this slot`
    if (endMins   > slotEnd)      return `Booking must end by ${slotEnd === 1440 ? '12:00 AM' : formatTime12h(slot.end)}`

    // 5-min grace window so a booking for "right now" still works
    const startMs = new Date(`${date}T${start}+05:30`).getTime()
    if (startMs < Date.now() - 5 * 60_000) return 'Start time cannot be in the past'
    return ''
  }, [])

  /* ─── Live price preview (debounced 500ms) ─── */
  const previewTimer = useRef<ReturnType<typeof setTimeout>>()

  const refreshPreview = useCallback((
    slot: SlotConfig | null,
    date: string,
    start: string,
    end: string,
  ) => {
    clearTimeout(previewTimer.current)
    const err = validateTimes(slot, date, start, end)
    setStep1Error(err)
    if (err) { setPricePreview(null); return }

    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true)
      const endMins = timeToMinutes(end)
      const endDateForServer = endMins === 0
        ? new Date(new Date(date + 'T00:00:00+05:30').getTime() + 86_400_000)
            .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
        : date
      const res = await getBookingPricePreview(library.id, `${date}T${start}`, `${endDateForServer}T${end}`)
      setPreviewLoading(false)
      if (res.success === false) {
        setStep1Error(res.error)
        setPricePreview(null)
      } else {
        setPricePreview({
          amount:       res.data.amount,
          platformFee:  res.data.platformFee,
          totalPayable: res.data.totalPayable,
          hourlyRate:   res.data.hourlyRate,
        })
        setStep1Error('')
      }
    }, 500)
  }, [library.id, validateTimes])

  /* ─── Handlers ─── */

  function handleSlotSelect(id: string) {
    setSelectedSlotId(id)
    // useEffect above resets start/end/preview
  }

  function handleStartChange(val: string) {
    setStartTime(val)
    refreshPreview(selectedSlot, selectedDate, val, endTime)
  }

  function handleEndChange(val: string) {
    setEndTime(val)
    refreshPreview(selectedSlot, selectedDate, startTime, val)
  }

  function handleDateChange(val: string) {
    setSelectedDate(val)
    refreshPreview(selectedSlot, val, startTime, endTime)
  }

  /** Build the IST range strings for server actions, handling midnight end. */
  function resolveServerRange(): { startIST: string; endIST: string } {
    const endMins = timeToMinutes(endTime)
    const endDateForServer = endMins === 0
      ? new Date(new Date(selectedDate + 'T00:00:00+05:30').getTime() + 86_400_000)
          .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
      : selectedDate
    return {
      startIST: `${selectedDate}T${startTime}`,
      endIST:   `${endDateForServer}T${endTime}`,
    }
  }

  /* ─── Step 1 → Step 2 ─── */
  function goToStep2() {
    const err = validateTimes(selectedSlot, selectedDate, startTime, endTime)
    if (err) { setStep1Error(err); return }
    setSelectedSeatId(null)
    setStep2Error('')
    setStep(2)

    const range = resolveServerRange()
    step2RangeRef.current = range   // used by realtime handler

    setSeatsLoading(true)
    getSeatAvailability(library.id, range.startIST, range.endIST).then((data) => {
      setSeats(data)
      setSeatsLoading(false)
    })
  }

  /* ─── Step 2 → Step 3 ─── */
  function goToStep3() {
    if (!selectedSeatId) { setStep2Error('Please select a seat to continue'); return }
    setStep3Error('')
    setStep(3)
  }

  /* ─── Step 3: Pay ─── */
  function handlePay() {
    if (!selectedSeatId || !selectedSlot || !pricePreview) return

    // Subscription-covered path — no Razorpay round-trip, the RPC either
    // confirms immediately or rejects outright. Kept as a fully separate
    // branch rather than threading subscription logic through the paid
    // flow below, since the mechanics genuinely differ (see
    // student-subscription-booking.ts's file-level doc comment).
    if (useSubId) {
      handleBookViaSubscription(useSubId)
      return
    }

    setPayLoading(true)
    setStep3Error('')

    const { startIST, endIST } = resolveServerRange()

    startTransition(async () => {
      const initRes = await initiateBooking({
        libraryId: library.id,
        seatId:    selectedSeatId,
        startTime: startIST,
        endTime:   endIST,
      })

      if (initRes.success === false) {
        setStep3Error(initRes.error)
        setPayLoading(false)
        return
      }

      const { bookingId, amount, razorpayOrderId, razorpayKeyId, libraryName, testMode } = initRes.data

      // ── TEST_MODE: skip Razorpay, confirm directly with synthetic IDs ──
      if (testMode) {
        console.log('[TEST_MODE] Bypassing Razorpay checkout, confirming booking directly')
        const confirmRes = await confirmBookingPayment({
          bookingId,
          razorpayOrderId:   razorpayOrderId,
          razorpayPaymentId: `test_pay_${Date.now()}`,
          razorpaySignature: 'test_signature_bypass',
        })
        if (confirmRes.success === false) {
          setStep3Error(confirmRes.error)
          setPayLoading(false)
          return
        }
        router.push(`/library/${library.id}/book/confirm?booking=${bookingId}`)
        return
      }

      openCheckout({
        orderId:     razorpayOrderId,
        keyId:       razorpayKeyId,
        amount,
        name:        libraryName,
        description: `Seat ${selectedSeat?.label ?? ''} · ${fmt12h(startTime)}–${fmt12h(endTime)}`,
        prefill: {
          name:  profile?.full_name ?? profile?.name ?? '',
          email: profile?.email ?? '',
          phone: profile?.phone ?? '',
        },
        onSuccess: async (paymentId, orderId, signature) => {
          const confirmRes = await confirmBookingPayment({
            bookingId,
            razorpayOrderId:   orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          })

          if (confirmRes.success === false) {
            setStep3Error(confirmRes.error)
            setPayLoading(false)
            return
          }

          router.push(`/library/${library.id}/book/confirm?booking=${bookingId}`)
        },
        onDismiss: () => { setPayLoading(false) },
        onError:   (errMsg) => { setStep3Error(errMsg); setPayLoading(false) },
      })
    })
  }

  function handleBookViaSubscription(subscriptionId: string) {
    if (!selectedSeatId) return
    setPayLoading(true)
    setStep3Error('')

    const { startIST, endIST } = resolveServerRange()

    startTransition(async () => {
      const res = await bookSeatViaSubscription({
        subscriptionId,
        libraryId: library.id,
        seatId:    selectedSeatId,
        startTime: startIST,
        endTime:   endIST,
      })

      if (res.success === false) {
        setStep3Error(res.error)
        setPayLoading(false)
        return
      }

      router.push(`/library/${library.id}/book/confirm?booking=${res.data.bookingId}`)
    })
  }

  /* ─── Back navigation ─── */
  function handleBack() {
    if (step === 1) router.push(`/library/${library.id}`)
    else if (step === 2) { setStep(1); setStep1Error('') }
    else if (step === 3) { setStep(2); setStep3Error('') }
  }

  /* ─── Duration display ─── */
  const durationH = startTime && endTime
    ? (() => {
        const sm = timeToMinutes(startTime)
        let em   = timeToMinutes(endTime)
        if (em === 0) em = 1440
        return (em - sm) / 60
      })()
    : 0

  const today = todayIST()

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E4EAF2] shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="w-8 h-8 rounded-lg border border-[#DDE4EE] flex items-center justify-center text-[#6E7F94] hover:bg-[#F4F7FB] transition-colors flex-shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-[#0D1117] truncate">{library.name}</div>
            <div className="text-[11px] text-[#9AACBE] truncate">
              {library.area}, {library.city}
            </div>
          </div>
          <span
            className={[
              'text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0',
              library.status.isOpen
                ? 'bg-[#E2F5EE] text-[#0D7C54]'
                : 'bg-[#FEE2E2] text-[#C5282C]',
            ].join(' ')}
          >
            {library.status.isOpen ? 'Open' : 'Closed'}
          </span>
        </div>
        <StepBar current={step} />
      </div>

      {/* ─────────────────── STEP 1: Slot & Time ─────────────────── */}
      {step === 1 && (
        <div className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full">

          {/* Slot cards */}
          <div>
            <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest mb-3">
              Select a time slot
            </p>
            <div className="space-y-2">
              {slots.map((slot) => {
                const rate     = effectiveSlotRate(slot)
                const active   = slot.id === selectedSlotId
                const endLabel = effectiveSlotEndMinutes(slot) === 1440 ? '12:00 AM' : formatTime12h(slot.end)
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSlotSelect(slot.id)}
                    className={[
                      'w-full flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-all',
                      active
                        ? 'border-[#1E5CFF] bg-[rgba(30,92,255,0.05)] shadow-[0_0_0_1px_#1E5CFF]'
                        : 'border-[#DDE4EE] bg-white hover:border-[#1E5CFF]',
                    ].join(' ')}
                  >
                    <div>
                      <div className="text-[13px] font-bold text-[#0D1117]">
                        {formatTime12h(slot.start)} – {endLabel}
                      </div>
                      <div className="text-[11px] text-[#9AACBE] mt-0.5">
                        {daysDisplay(slot.days)}
                        {slot.discount > 0 && (
                          <span className="ml-2 text-[#0D7C54] font-medium">
                            ₹{slot.discount}/hr off
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      {slot.discount > 0 && (
                        <div className="text-[10px] text-[#9AACBE] line-through">
                          ₹{slot.price}/hr
                        </div>
                      )}
                      <div className="text-[17px] font-bold text-[#1E5CFF]">₹{rate}</div>
                      <div className="text-[10px] text-[#9AACBE]">/hr</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date + time pickers */}
          <div>
            <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest mb-3">
              Choose your time
            </p>
            <div className="bg-white border border-[#DDE4EE] rounded-xl overflow-hidden divide-y divide-[#F0F4F8]">

              {/* Date */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Calendar className="w-4 h-4 text-[#9AACBE] flex-shrink-0" />
                <span className="text-[12px] text-[#9AACBE] w-14 flex-shrink-0">Date</span>
                <input
                  type="date"
                  value={selectedDate}
                  min={today}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="flex-1 text-[13px] font-medium text-[#0D1117] bg-transparent outline-none cursor-pointer"
                />
              </div>

              {/* Start time */}
              <div className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap">
                <Clock className="w-4 h-4 text-[#9AACBE] flex-shrink-0" />
                <span className="text-[12px] text-[#9AACBE] w-14 flex-shrink-0">Start</span>
                <div className="flex-1">
                  <TimePicker
                    value={startTime}
                    onChange={handleStartChange}
                    minMins={slotStartMins}
                    maxMins={slotEndMins - 30}
                  />
                </div>
                {selectedSlot && (
                  <span className="text-[10px] text-[#9AACBE] flex-shrink-0 ml-auto sm:ml-0">
                    from {formatTime12h(selectedSlot.start)}
                  </span>
                )}
              </div>

              {/* End time */}
              <div className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap">
                <Clock className="w-4 h-4 text-[#9AACBE] flex-shrink-0" />
                <span className="text-[12px] text-[#9AACBE] w-14 flex-shrink-0">End</span>
                <div className="flex-1">
                  <TimePicker
                    value={endTime}
                    onChange={handleEndChange}
                    minMins={startTime ? timeToMinutes(startTime) + 30 : slotStartMins + 30}
                    maxMins={slotEndMins === 1440 ? 1439 : slotEndMins}
                  />
                </div>
                {selectedSlot && (
                  <span className="text-[10px] text-[#9AACBE] flex-shrink-0 ml-auto sm:ml-0">
                    by {slotEndMins === 1440 ? '12:00 AM' : formatTime12h(selectedSlot.end)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Error */}
          {step1Error && <ErrorBox msg={step1Error} />}

          {/* Price preview */}
          {!step1Error && durationH >= 0.5 && (
            <div className="bg-[rgba(30,92,255,0.06)] border border-[rgba(30,92,255,0.18)] rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#6E7F94]">Estimated total</div>
                {previewLoading
                  ? <div className="mt-1 h-4 w-32 rounded-md bg-[#DDE4EE] animate-pulse" />
                  : pricePreview
                    ? (
                      <div className="text-[11px] text-[#9AACBE] mt-0.5">
                        {durationH.toFixed(1)} hr × ₹{pricePreview.hourlyRate}/hr
                      </div>
                    )
                    : null
                }
              </div>
              {previewLoading
                ? <Loader2 className="w-5 h-5 text-[#1E5CFF] animate-spin" />
                : pricePreview
                  ? <span className="text-[22px] font-bold text-[#1E5CFF]">₹{pricePreview.amount}</span>
                  : null
              }
            </div>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={goToStep2}
            disabled={!!step1Error || !startTime || !endTime || previewLoading || (!pricePreview && !step1Error)}
            className="w-full py-3.5 rounded-xl bg-[#1E5CFF] text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(30,92,255,.3)] hover:bg-[#1447D4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {previewLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating price…</>
              : <>Check Seat Availability <ArrowRight className="w-4 h-4" /></>
            }
          </button>
        </div>
      )}

      {/* ─────────────────── STEP 2: Pick Seat ─────────────────── */}
      {step === 2 && (
        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">

          {/* Time summary pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-white border border-[#DDE4EE] rounded-full px-3 py-1 text-[12px] font-medium text-[#3A4A5C]">
              <Calendar className="w-3.5 h-3.5 text-[#9AACBE]" />
              {fmtDate(`${selectedDate}T${startTime}`)}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white border border-[#DDE4EE] rounded-full px-3 py-1 text-[12px] font-medium text-[#3A4A5C]">
              <Clock className="w-3.5 h-3.5 text-[#9AACBE]" />
              {fmt12h(startTime)} – {timeToMinutes(endTime) === 0 ? '12:00 AM' : fmt12h(endTime)}
            </span>
            {pricePreview && (
              <span className="inline-flex items-center gap-1.5 bg-[rgba(30,92,255,0.08)] border border-[rgba(30,92,255,0.2)] rounded-full px-3 py-1 text-[12px] font-bold text-[#1E5CFF]">
                <Tag className="w-3.5 h-3.5" />
                ₹{pricePreview.amount}
              </span>
            )}
          </div>

          {/* Live update badge */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#0D7C54]">
            <span className="w-2 h-2 rounded-full bg-[#0D7C54] animate-pulse" />
            Seat map updates live — auto-refreshes if someone else books
          </div>

          <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest">
            Select a seat
          </p>

          {/* SeatGrid */}
          <div className="bg-white border border-[#DDE4EE] rounded-xl p-4">
            <SeatGrid
              seats={seats}
              selectedId={selectedSeatId}
              onSelect={(id) => { setSelectedSeatId(id || null); setStep2Error('') }}
              loading={seatsLoading}
            />
          </div>

          {!seatsLoading && seats.length === 0 && (
            <ErrorBox msg="No seats are configured for this library yet. Please contact the library." />
          )}
          {!seatsLoading && seats.length > 0 && seats.every((s) => !s.is_available) && (
            <ErrorBox msg="All seats are booked for this time. Try a different time or date." />
          )}

          {step2Error && <ErrorBox msg={step2Error} />}

          {/* Selected seat summary */}
          {selectedSeat && (
            <div className="bg-[rgba(30,92,255,0.05)] border border-[rgba(30,92,255,0.2)] rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Armchair className="w-4 h-4 text-[#1E5CFF]" />
                <span className="text-[13px] font-bold text-[#0D1117]">
                  Seat {selectedSeat.label} selected
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSeatId(null)}
                className="text-[12px] text-[#1E5CFF] font-semibold hover:underline"
              >
                Change
              </button>
            </div>
          )}

          {/* CTAs */}
          <button
            type="button"
            onClick={goToStep3}
            disabled={!selectedSeatId || seatsLoading}
            className="w-full py-3.5 rounded-xl bg-[#1E5CFF] text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(30,92,255,.3)] hover:bg-[#1447D4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Continue to Payment
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="w-full py-3 rounded-xl bg-white border border-[#DDE4EE] text-[13px] font-medium text-[#6E7F94] hover:bg-[#F4F7FB] transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* ─────────────────── STEP 3: Confirm & Pay ─────────────────── */}
      {step === 3 && (
        <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">

          <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest">
            Booking summary
          </p>

          {/* Summary card */}
          <div className="bg-white border border-[#DDE4EE] rounded-xl overflow-hidden divide-y divide-[#F0F4F8]">
            {[
              { icon: MapPin,   label: 'Library',  value: library.name },
              { icon: MapPin,   label: 'Address',  value: `${library.area}, ${library.city}` },
              { icon: Armchair, label: 'Seat',     value: selectedSeat?.label ?? '—' },
              { icon: Calendar, label: 'Date',     value: fmtDate(`${selectedDate}T${startTime}`) },
              { icon: Clock,    label: 'Time',     value: `${fmt12h(startTime)} – ${timeToMinutes(endTime) === 0 ? '12:00 AM' : fmt12h(endTime)}` },
              { icon: Clock,    label: 'Duration', value: `${durationH.toFixed(1)} hrs` },
              { icon: Tag,      label: 'Slot rate',value: `₹${effectiveRate}/hr` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3">
                <Icon className="w-4 h-4 text-[#9AACBE] flex-shrink-0" />
                <span className="text-[12px] text-[#9AACBE] w-20 flex-shrink-0">{label}</span>
                <span className="text-[13px] font-semibold text-[#0D1117] flex-1 text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Subscription option — only rendered when eligible for the currently selected time */}
          {subsForCurrentTime.length > 0 && (
            <div className="bg-[#F0F9F4] border border-[#B8E6C9] rounded-xl px-4 py-3.5 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!useSubId}
                  onChange={e => setUseSubId(e.target.checked ? subsForCurrentTime[0].id : null)}
                  className="mt-0.5 w-4 h-4 accent-[#0D7C54]"
                />
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-[#0A5C3E]">
                    Book free with your membership
                  </div>
                  <div className="text-[11.5px] text-[#3D7A5C] mt-0.5">
                    {subsForCurrentTime[0].sessionsLimit === null
                      ? `${subsForCurrentTime[0].planName} — unlimited sessions`
                      : `${subsForCurrentTime[0].planName} — ${subsForCurrentTime[0].sessionsUsed}/${subsForCurrentTime[0].sessionsLimit} sessions used`}
                  </div>
                </div>
              </label>

              {subsForCurrentTime.length > 1 && useSubId && (
                <select
                  value={useSubId}
                  onChange={e => setUseSubId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-[#B8E6C9] bg-white text-[12px] font-medium text-[#0A5C3E]"
                >
                  {subsForCurrentTime.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.planName} ({s.sessionsLimit === null ? 'unlimited' : `${s.sessionsUsed}/${s.sessionsLimit} used`})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Owner has a subscription, but none of their plans' time
              windows cover the currently selected time — explain why the
              free-with-membership option isn't showing, instead of
              silently hiding it with no context. */}
          {subsForCurrentTime.length === 0 && eligibleSubs.length > 0 && startTime && endTime && (
            <div className="bg-[#FFF7ED] border border-[#FDE3C5] rounded-xl px-4 py-3 text-[12px] text-[#92400E]">
              {eligibleSubs.length === 1
                ? (() => {
                    const s = eligibleSubs[0]
                    const parts: string[] = []
                    if (s.timeWindowStart && s.timeWindowEnd) parts.push(`${s.timeWindowStart.slice(0, 5)}–${s.timeWindowEnd.slice(0, 5)}`)
                    const dayDesc = describeDaysOfWeek(s.daysOfWeek)
                    if (dayDesc) parts.push(dayDesc)
                    return `Your ${s.planName} plan only covers ${parts.join(', ')}. This booking is outside that, so it'll be charged as a paid seat.`
                  })()
                : `None of your plans cover this day/time — booking here will be charged as a paid seat.`}
            </div>
          )}

          {/* Price breakdown — hidden when booking via subscription, since
              nothing is charged */}
          {useSubId ? (
            <div className="bg-white border border-[#DDE4EE] rounded-xl px-4 py-4">
              <div className="flex justify-between items-center">
                <span className="text-[14px] font-bold text-[#0D1117]">Total payable</span>
                <span className="text-[20px] font-bold text-[#0D7C54]">Covered by plan</span>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#DDE4EE] rounded-xl px-4 py-4 space-y-2">
              <div className="flex justify-between text-[12px] text-[#6E7F94]">
                <span>₹{effectiveRate} × {durationH.toFixed(1)} hr</span>
                <span>₹{pricePreview?.amount ?? '—'}</span>
              </div>
              <div className="flex justify-between text-[12px] text-[#6E7F94]">
                <span>Platform fee</span>
                <span>₹{pricePreview?.platformFee ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center border-t border-[#F0F4F8] pt-3 mt-2">
                <span className="text-[14px] font-bold text-[#0D1117]">Total payable</span>
                <span className="text-[22px] font-bold text-[#1E5CFF]">₹{pricePreview?.totalPayable ?? '—'}</span>
              </div>
            </div>
          )}

          {/* Trust note — only relevant for the paid flow */}
          {!useSubId && (
            <div className="flex items-center gap-2 text-[11px] text-[#9AACBE]">
              <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
              Secure payment via Razorpay · UPI, Cards, Net Banking, Wallets
            </div>
          )}

          {step3Error && <ErrorBox msg={step3Error} />}

          {/* Pay CTA */}
          <button
            type="button"
            onClick={handlePay}
            disabled={payLoading || isPending || (!useSubId && !pricePreview)}
            className={
              useSubId
                ? "w-full py-3.5 rounded-xl bg-[#0D7C54] text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(13,124,84,.3)] hover:bg-[#0A5C3E] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                : "w-full py-3.5 rounded-xl bg-[#1E5CFF] text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(30,92,255,.3)] hover:bg-[#1447D4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            }
          >
            {payLoading || isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              : useSubId
                ? <><CheckCircle className="w-4 h-4" /> Book with subscription</>
                : <><CreditCard className="w-4 h-4" /> Pay ₹{pricePreview?.totalPayable ?? '—'}</>
            }
          </button>

          <button
            type="button"
            onClick={handleBack}
            disabled={payLoading || isPending}
            className="w-full py-3 rounded-xl bg-white border border-[#DDE4EE] text-[13px] font-medium text-[#6E7F94] hover:bg-[#F4F7FB] transition-colors disabled:opacity-50"
          >
            Back
          </button>

          <p className="text-center text-[11px] text-[#9AACBE]">
            Your seat is held for 15 minutes after clicking Pay.
          </p>
        </div>
      )}
    </div>
  )
}