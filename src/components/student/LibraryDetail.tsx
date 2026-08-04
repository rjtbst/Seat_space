// components/student/LibraryDetail.tsx
'use client'

/**
 * Library detail page — UNIFIED FLOW.
 *
 * Replaces the old "click CTA → navigate to /book/seat → 3-step wizard" path.
 *
 * New experience:
 *   1. Open Library Detail page
 *   2. See live seat map immediately (fetches availability for current slot)
 *   3. Pick a seat inline — no page navigation
 *   4. Pick time (start/end within the slot)
 *   5. Instant price preview
 *   6. Book — Razorpay opens OR test-mode skips to confirmation
 *
 * Architecture:
 *   - LibraryDetail is 'use client'. Server-fetched data (library, slots,
 *     plans, freeSeats, status, activeSub) flows in as props.
 *   - Seat availability is fetched client-side on mount and re-fetched
 *     whenever the selected slot or time window changes (debounced 600ms).
 *   - Supabase realtime subscription on bookings table keeps the seat map
 *     live — any booking change by another student instantly re-fetches.
 *   - The old multi-page BookSeatClient (/book/seat) still works for direct
 *     URL access. This page replaces the entry flow only.
 */

import {
  useState, useCallback, useEffect, useRef, useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft, Star, MapPin, Clock, Wifi, Wind, Volume2, Zap,
  Car, Coffee, ChevronLeft, ChevronRight, Users, Calendar,
  Zap as Flash, CreditCard, Loader2, AlertCircle, ArrowRight,
  Tag, CheckCircle, Armchair,
} from 'lucide-react'
import {
  type SlotConfig,
  type SlotDisplayOption,
  slotToDisplayOption,
  effectiveSlotRate,
  formatTime12h,
  timeToMinutes,
} from '@/lib/booking/types'
import type { LibraryStatus } from '@/lib/booking/libraryStatus'
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
  requestBook,
  type LibraryBook,
} from '@/lib/actions/students/student-books'
import type { StudentProfile } from '@/lib/actions/students/student-profile'
import { useRazorpay } from '@/hooks/userazorpay'
import SeatGrid from './SeatGrid'
import { SubscribeModal } from './SubscribeModal'
import { TimePicker } from './TimePicker'
import { describeDaysOfWeek } from '@/lib/booking/subscriptionEntitlement'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Plan = {
  id: string; name: string; price: number
  duration_days: number
  time_window_start?: string | null
  time_window_end?:   string | null
  days_of_week?:      number[] | null
}
type Library = {
  id: string; name: string; description: string | null
  city: string; area: string; address: string
  rating: number; total_reviews: number
  amenities: string[]; images: string[]
}

const AMENITY_ICONS: Record<string, React.ElementType> = {
  WiFi: Wifi, AC: Wind, 'Quiet Zone': Volume2, 'Power Sockets': Zap, Parking: Car, Cafe: Coffee,
}
const PLAN_COLORS = ['#0597A7', '#1E5CFF', '#6B3FD4', '#0A7C5C', '#C96A00']
const GRADS = [
  'linear-gradient(135deg,#E0E8FF,#C7D4F7)',
  'linear-gradient(135deg,#D4EDD4,#B8DDB8)',
  'linear-gradient(135deg,#F0E8FF,#DDD0F7)',
]

/* ─── Helper ─────────────────────────────────────────────────────────────── */

function headerPrice(
  status: LibraryStatus,
  allSlots: SlotConfig[],
): { label: string; rate: number } | null {
  const active = allSlots.filter((s) => s.is_active)
  if (active.length === 0) return null
  if (status.isOpen && status.currentSlot) {
    return { label: 'Now', rate: effectiveSlotRate(status.currentSlot) }
  }
  const lowest = [...active].sort((a, b) => effectiveSlotRate(a) - effectiveSlotRate(b))[0]
  return { label: 'From', rate: effectiveSlotRate(lowest) }
}

/** Today in IST as YYYY-MM-DD */
function todayIST(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
}

/** Minutes → HH:MM, clamped to 23:59 */
function minsToHHMM(mins: number): string {
  const clamped = Math.min(mins, 23 * 60 + 59)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** Slot end treating 00:00 as end-of-day (1440 min) */
function effectiveSlotEndMins(slot: SlotConfig): number {
  const e = timeToMinutes(slot.end)
  return e === 0 ? 1440 : e
}

/** fmt 24h → 9:00 AM */
function fmt12h(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const a = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${a}`
}

/* ─── ErrorBox ─────────────────────────────────────────────────────────── */

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="clay-raised-sm flex items-start gap-2 px-3 py-2.5 text-[12px] text-[#C5282C]" style={{ background: '#FFF0F0' }}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default function LibraryDetail({
  library,
  ownerSlots,
  plans,
  books,
  freeSeats,
  status,
  activeSub,
  profile,
}: {
  library:    Library
  ownerSlots: SlotConfig[]
  plans:      Plan[]
  books:      LibraryBook[]
  freeSeats:  number
  status:     LibraryStatus
  activeSub:  { planName: string; endDate: string } | null
  profile:    StudentProfile | null
}) {
  const router = useRouter()
  const { openCheckout } = useRazorpay()
  const [isPending, startTransition] = useTransition()

  const [imgIdx, setImgIdx] = useState(0)
  const [subscribePlan, setSubscribePlan] = useState<Plan | null>(null)

  // ── Booking panel state ──────────────────────────────────────────────────
  const [bookingOpen,    setBookingOpen]    = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState<string>('')
  const [selectedDate,   setSelectedDate]   = useState<string>(todayIST())
  const [startTime,      setStartTime]      = useState<string>('')
  const [endTime,        setEndTime]        = useState<string>('')
  const [pricePreview,   setPricePreview]   = useState<{ amount: number; hourlyRate: number } | null>(null)
  const [timeError,      setTimeError]      = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  // Seat state
  const [seats,          setSeats]          = useState<SeatAvailability[]>([])
  const [seatsLoading,   setSeatsLoading]   = useState(false)
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
  const [seatError,      setSeatError]      = useState<string>('')
  const step2RangeRef = useRef<{ startIST: string; endIST: string } | null>(null)

  // Tracks the booking row created by THIS student's own in-progress pay
  // flow (set the moment initiateBooking() returns, cleared once the flow
  // finishes either way). The realtime handler below watches every
  // booking change on this library -- without this, the student's own
  // held-booking INSERT (and the confirmed-booking UPDATE right after
  // payment) fire the exact same "someone else took this seat" path as a
  // real conflict, deselecting their seat and showing an error for a
  // booking they just successfully paid for.
  const myPendingBookingIdRef = useRef<string | null>(null)

  // Pay state
  const [payLoading, setPayLoading] = useState(false)
  const [payError,   setPayError]   = useState<string>('')

  // Books tab state
  const [bookQuery,       setBookQuery]       = useState('')
  const [bookResults,     setBookResults]     = useState<LibraryBook[]>(books)
  const [requestingId,    setRequestingId]    = useState<string | null>(null)
  const [requestedIds,    setRequestedIds]    = useState<Set<string>>(new Set())
  const [requestMsgId,    setRequestMsgId]    = useState<string | null>(null)
  const [requestErrId,    setRequestErrId]    = useState<string | null>(null)
  const [requestErrMsg,   setRequestErrMsg]   = useState<string>('')

  const activeSlots   = ownerSlots.filter((s) => s.is_active)
  const slotOptions   = activeSlots.map(slotToDisplayOption)
  const price         = headerPrice(status, ownerSlots)
  const isOpen        = status.isOpen
  const hasAnySlots   = activeSlots.length > 0
  const selectedSlot  = activeSlots.find((s) => s.id === selectedSlotId) ?? null
  const slotStartMins = selectedSlot ? timeToMinutes(selectedSlot.start) : 0
  const slotEndMins   = selectedSlot ? effectiveSlotEndMins(selectedSlot) : 24 * 60
  const selectedSeat  = seats.find((s) => s.id === selectedSeatId) ?? null

  // Duration
  const durationH = startTime && endTime
    ? (() => {
        const sm = timeToMinutes(startTime)
        let em   = timeToMinutes(endTime)
        if (em === 0) em = 1440
        return (em - sm) / 60
      })()
    : 0

  /* ── Init slot selection ─────────────────────────────────────────────── */
  useEffect(() => {
    if (activeSlots.length > 0 && !selectedSlotId) {
      setSelectedSlotId(activeSlots[0].id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Init times when slot / date changes ─────────────────────────────── */
  useEffect(() => {
    if (!selectedSlot) return

    const nowIST  = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
    const nowDate = nowIST.slice(0, 10)
    const [, time] = nowIST.split(' ')
    const [h, m]   = time.split(':').map(Number)
    const nowMins  = h * 60 + m

    let defStart = slotStartMins
    if (selectedDate === nowDate && nowMins > slotStartMins && nowMins < slotEndMins) {
      defStart = Math.ceil(nowMins / 15) * 15
    }
    let defEnd = Math.min(defStart + 120, slotEndMins)

    if (defEnd - defStart < 60) defStart = Math.max(slotStartMins, defEnd - 60)
    if (defEnd - defStart < 30) { defStart = slotStartMins; defEnd = slotEndMins }

    const newStart = minsToHHMM(defStart)
    const newEnd   = minsToHHMM(defEnd)
    setStartTime(newStart)
    setEndTime(newEnd)
    setTimeError('')
    setPricePreview(null)

    // Auto-preview with default times
    setTimeout(() => refreshPreview(selectedSlot, selectedDate, newStart, newEnd), 0)
  }, [selectedSlotId, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Open booking panel: fetch seats ────────────────────────────────── */
  useEffect(() => {
    if (!bookingOpen || !selectedSlot || !startTime || !endTime) return
    fetchSeats()
  }, [bookingOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Re-fetch seats when time window changes (debounced) ────────────── */
  const seatsDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!bookingOpen || !selectedSlot || !startTime || !endTime) return
    clearTimeout(seatsDebounceRef.current)
    seatsDebounceRef.current = setTimeout(fetchSeats, 600)
    return () => clearTimeout(seatsDebounceRef.current)
  }, [startTime, endTime, selectedSlotId, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Realtime seat sync ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!bookingOpen) return

    const supabase = createBrowserSupabaseClient()
    const channel  = supabase
      .channel(`lib-detail-seats-${library.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `library_id=eq.${library.id}` },
        (payload) => {
          const range = step2RangeRef.current
          if (!range) return

          // This change is the student's own booking -- either the held
          // row from initiateBooking (and its confirmed-payment update
          // right after), or a subscription-covered booking created
          // directly as confirmed. Either way it's not a competing
          // booking, and REPLICA IDENTITY FULL on this table means
          // user_id is present on both INSERT and UPDATE/DELETE payloads,
          // so this check works for all of them -- not just the ones we
          // could pre-track a bookingId for. Surfacing "your seat was
          // just taken" for a seat you just successfully paid for is a
          // false alarm, not a real conflict.
          const changedRow = (payload.new ?? payload.old) as { id?: string; user_id?: string } | null
          if (changedRow?.user_id && changedRow.user_id === profile?.id) return
          if (changedRow?.id && changedRow.id === myPendingBookingIdRef.current) return

          // Skip changes that can't affect the currently selected window —
          // see BookSeatClient.tsx for the full rationale. Without this,
          // every booking change anywhere in the library re-fetches for
          // every concurrently-browsing viewer regardless of relevance.
          const row = (payload.new ?? payload.old) as { start_time?: string; end_time?: string } | null
          if (row?.start_time && row?.end_time) {
            const overlaps = row.start_time < range.endIST && row.end_time > range.startIST
            if (!overlaps) return
          }

          getSeatAvailability(library.id, range.startIST, range.endIST).then((fresh) => {
            setSeats(fresh)
            setSelectedSeatId((prev) => {
              if (!prev) return null
              const ok = fresh.find((s) => s.id === prev)?.is_available
              if (!ok) {
                setSeatError('Your selected seat was just taken. Please choose another.')
                return null
              }
              return prev
            })
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [bookingOpen, library.id, profile?.id])

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function resolveRange(): { startIST: string; endIST: string } {
    const endMins = timeToMinutes(endTime)
    const endDateForServer = endMins === 0
      ? new Date(new Date(selectedDate + 'T00:00:00+05:30').getTime() + 86_400_000)
          .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
      : selectedDate
    return { startIST: `${selectedDate}T${startTime}`, endIST: `${endDateForServer}T${endTime}` }
  }

  function validateTimes(): string {
    if (!selectedSlot) return 'Please select a slot'
    if (!startTime || !endTime) return 'Please set both start and end time'
    const sm = timeToMinutes(startTime)
    let   em = timeToMinutes(endTime)
    if (em === 0) em = 1440
    if (em <= sm)         return 'End time must be after start time'
    if (em - sm < 30)     return 'Minimum booking is 30 minutes'
    if (sm < slotStartMins) return `Start must be at or after ${formatTime12h(selectedSlot.start)}`
    if (em > slotEndMins)   return `Must end by ${slotEndMins === 1440 ? '12:00 AM' : formatTime12h(selectedSlot.end)}`
    const startMs = new Date(`${selectedDate}T${startTime}+05:30`).getTime()
    if (startMs < Date.now() - 5 * 60_000) return 'Start time cannot be in the past'
    return ''
  }

  const previewTimer = useRef<ReturnType<typeof setTimeout>>()
  // Same fix as BookSeatClient.tsx's refreshPreview: without this, a
  // response from an older (now-stale) time selection can resolve AFTER
  // a newer one and silently overwrite the correct price with a wrong
  // one. Only the response matching the most recently fired request is
  // ever applied.
  const previewRequestId = useRef(0)
  const refreshPreview = useCallback((
    slot: SlotConfig | null,
    date: string,
    start: string,
    end: string,
  ) => {
    clearTimeout(previewTimer.current)
    if (!slot || !start || !end) return
    const sm = timeToMinutes(start)
    let   em = timeToMinutes(end)
    if (em === 0) em = 1440
    if (em - sm < 30) { setPricePreview(null); return }

    previewTimer.current = setTimeout(async () => {
      const requestId = ++previewRequestId.current
      setPreviewLoading(true)
      const endMins = timeToMinutes(end)
      const endDate = endMins === 0
        ? new Date(new Date(date + 'T00:00:00+05:30').getTime() + 86_400_000)
            .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 10)
        : date
      const res = await getBookingPricePreview(library.id, `${date}T${start}`, `${endDate}T${end}`)
      if (requestId !== previewRequestId.current) return
      setPreviewLoading(false)
      if (res.success === false) {
        setTimeError(res.error)
        setPricePreview(null)
      } else {
        setPricePreview({ amount: res.data.amount, hourlyRate: res.data.hourlyRate })
        setTimeError('')
      }
    }, 500)
  }, [library.id])

  const seatsRequestId = useRef(0)
  function fetchSeats() {
    if (!startTime || !endTime || !selectedSlot) return
    const err = validateTimes()
    if (err) return
    const range = resolveRange()
    step2RangeRef.current = range
    const requestId = ++seatsRequestId.current
    setSeatsLoading(true)
    setSelectedSeatId(null)
    getSeatAvailability(library.id, range.startIST, range.endIST).then((data) => {
      // Discard if a newer time-window change has fired another fetch
      // since this one started — otherwise a slow response for an old
      // window can land after a fast one for the current window and
      // show stale (wrong) seat availability right before payment.
      if (requestId !== seatsRequestId.current) return
      setSeats(data)
      setSeatsLoading(false)
    })
  }

  function handleSlotChange(id: string) {
    setSelectedSlotId(id)
    setSelectedSeatId(null)
    setPayError('')
  }

  function handleStartChange(val: string) {
    setStartTime(val)
    setSelectedSeatId(null)
    const err = validateTimes()
    setTimeError(err)
    refreshPreview(selectedSlot, selectedDate, val, endTime)
  }

  function handleEndChange(val: string) {
    setEndTime(val)
    setSelectedSeatId(null)
    const err = validateTimes()
    setTimeError(err)
    refreshPreview(selectedSlot, selectedDate, startTime, val)
  }

  function handleDateChange(val: string) {
    setSelectedDate(val)
    setSelectedSeatId(null)
  }

  function handlePay() {
    const err = validateTimes()
    if (err) { setPayError(err); return }
    if (!selectedSeatId) { setPayError('Please select a seat'); return }
    if (!pricePreview)   { setPayError('Price not yet calculated — please wait'); return }

    setPayLoading(true)
    setPayError('')

    const { startIST, endIST } = resolveRange()

    startTransition(async () => {
      const initRes = await initiateBooking({
        libraryId: library.id,
        seatId:    selectedSeatId,
        startTime: startIST,
        endTime:   endIST,
      })

      if (initRes.success === false) {
        setPayError(initRes.error)
        setPayLoading(false)
        return
      }

      const { bookingId, amount, razorpayOrderId, razorpayKeyId, libraryName, testMode } = initRes.data
      myPendingBookingIdRef.current = bookingId

      // TEST_MODE: bypass Razorpay, confirm directly
      if (testMode) {
        console.log('[TEST_MODE] Direct confirmation without Razorpay')
        const confirmRes = await confirmBookingPayment({
          bookingId,
          razorpayOrderId,
          razorpayPaymentId: `test_pay_${Date.now()}`,
          razorpaySignature: 'test_signature_bypass',
        })
        if (confirmRes.success === false) {
          myPendingBookingIdRef.current = null
          setPayError(confirmRes.error)
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
        description: `Seat ${selectedSeat?.label ?? ''} · ${startIST.slice(11)} – ${endIST.slice(11)}`,
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
            myPendingBookingIdRef.current = null
            setPayError(confirmRes.error)
            setPayLoading(false)
            return
          }
          router.push(`/library/${library.id}/book/confirm?booking=${bookingId}`)
        },
        onDismiss: () => { myPendingBookingIdRef.current = null; setPayLoading(false) },
        onError:   (msg) => { myPendingBookingIdRef.current = null; setPayError(msg); setPayLoading(false) },
      })
    })
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */

  const today = todayIST()
  const canPay = !timeError && !!pricePreview && !!selectedSeatId && !payLoading && !isPending

  return (
    <div className="p-5 pb-36 max-w-3xl mx-auto">

      {/* ── Back + status ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 mb-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-[13px] font-medium text-[#6E7F94] hover:text-[#0D1117] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className={[
          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold',
          isOpen ? 'bg-[#E2F5EE] text-[#065F46]' : 'bg-[#FDEAEA] text-[#9B1C1C]',
        ].join(' ')}>
          <span className="text-[8px]">●</span>
          {isOpen
            ? `Open · ${status.currentSlot ? `until ${status.currentSlot.end}` : 'now'}`
            : `Closed — ${status.todayHoursLabel}`}
        </span>
      </div>

      {/* ── Hero image ────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden h-[200px] sm:h-[240px] mb-5 flex items-center justify-center text-7xl"
        style={{ background: library.images.length === 0 ? GRADS[0] : undefined }}
      >
        {library.images.length > 0
          ? (
            <Image
              src={library.images[imgIdx % library.images.length]}
              alt={library.name}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 640px) 100vw, 768px"
            />
          )
          : '📚'}
        {library.images.length > 1 && (
          <>
            <button
              onClick={() => setImgIdx((i) => (i - 1 + library.images.length) % library.images.length)}
              className="clay-raised-sm clay-interactive absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setImgIdx((i) => (i + 1) % library.images.length)}
              className="clay-raised-sm clay-interactive absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/50 text-white rounded-md text-[11px] font-semibold">
              {imgIdx + 1} / {library.images.length}
            </div>
          </>
        )}
      </div>

      {/* ── Name + price ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto] gap-4 mb-4 items-start">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1117] tracking-[-0.4px] mb-1">{library.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#6E7F94] mb-1">
            <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{library.area}, {library.city}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-[#9AACBE]" />
            <span className="flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {library.rating.toFixed(1)}
              <span className="text-[#9AACBE]"> ({library.total_reviews})</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-[12px] text-[#6E7F94]">
            <Clock className="w-3 h-3" /> Today · {status.todayHoursLabel}
          </div>
        </div>
        <div className="text-right">
          {price ? (
            <div className="text-[22px] font-extrabold text-[#1E5CFF]">
              <span className="text-[12px] font-semibold text-[#9AACBE] mr-1">{price.label}</span>
              ₹{price.rate}<span className="text-[13px] font-medium text-[#6E7F94]"> /hr</span>
            </div>
          ) : (
            <div className="text-[13px] font-semibold text-[#9AACBE]">No slots</div>
          )}
          <div className={['text-[12px] font-semibold mt-1', freeSeats > 0 && isOpen ? 'text-[#12A87A]' : 'text-[#9AACBE]'].join(' ')}>
            {isOpen ? (freeSeats > 0 ? `● ${freeSeats} seats free` : 'Library Full') : 'Check back later'}
          </div>
        </div>
      </div>

      {/* ── Description ───────────────────────────────────────────────── */}
      {library.description && (
        <p className="text-[13px] text-[#6E7F94] leading-relaxed mb-4">{library.description}</p>
      )}

      {/* ── Active sub badge ──────────────────────────────────────────── */}
      {activeSub && (
        <div className="clay-raised-sm flex items-start gap-2.5 p-3.5 text-[12px] text-[#0A7C5C] mb-4" style={{ background: '#E2F5EE' }}>
          <span className="text-base flex-shrink-0">⭐</span>
          <div>Active <b>{activeSub.planName}</b> membership — sessions included in your plan.</div>
        </div>
      )}

      {/* ── Amenities ─────────────────────────────────────────────────── */}
      {library.amenities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {library.amenities.map((a) => {
            const Icon = AMENITY_ICONS[a]
            return (
              <span key={a} className="clay-chip gap-1.5 text-[11px] text-[#3A4A5C] px-2.5 py-1">
                {Icon && <Icon className="w-3 h-3 text-[#9AACBE]" />}{a}
              </span>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
           INLINE BOOKING PANEL
      ══════════════════════════════════════════════════════════════════ */}
      {hasAnySlots && (
        <div className="clay-raised overflow-hidden mb-5">

          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3.5" style={{ boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.2)' }}>
            <div className="flex items-center gap-2">
              <Flash className="w-4 h-4 text-amber-500" />
              <span className="text-[13px] font-bold text-[#0D1117]">Book a Seat</span>
              {/* Live dot */}
              <span className="flex items-center gap-1 text-[10px] font-semibold text-[#0D7C54] bg-[#E2F5EE] px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0D7C54] animate-pulse inline-block" />
                Live
              </span>
            </div>
            {!bookingOpen && (
              <button
                onClick={() => setBookingOpen(true)}
                className="text-[12px] font-semibold text-[#1E5CFF] hover:underline"
              >
                Open booking →
              </button>
            )}
          </div>

          {/* ── Slot selector ─────────────────────────────────────────── */}
          <div className="px-4 pt-4 pb-3">
            <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest mb-2">
              Select Slot
            </p>
            <div className="flex flex-col gap-1.5">
              {slotOptions.map((slot) => {
                const active = slot.id === selectedSlotId
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSlotChange(slot.id)}
                    className={[
                      'clay-interactive flex items-center justify-between rounded-xl px-4 py-3 text-left',
                      active ? 'clay-pressed' : 'clay-raised-sm',
                    ].join(' ')}
                  >
                    <div>
                      <div className="text-[13px] font-bold text-[#0D1117]">{slot.label}</div>
                      <div className="text-[11px] text-[#9AACBE] mt-0.5">{slot.days}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      {slot.discount > 0 && (
                        <div className="text-[10px] text-[#9AACBE] line-through">₹{slot.basePrice}/hr</div>
                      )}
                      <div className="text-[16px] font-extrabold text-[#1E5CFF]">
                        ₹{slot.finalPrice}<span className="text-[10px] font-medium text-[#9AACBE]">/hr</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Time + date pickers ───────────────────────────────────── */}
          <div className="px-4 pb-4 pt-3" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.2)' }}>
            <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest mb-3">
              Choose Time
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              {/* Date — spans both mobile columns so Start/End each get a
                  full half-width row below instead of squeezing into a
                  third of the screen. TimePicker renders 3 native
                  <select> elements (hour/min/AM-PM) side by side, which
                  needs ~140px minimum; a 3-way equal split on a ~360px
                  phone only gives ~100px, causing the controls to
                  overflow/overlap as seen in the screenshot. */}
              <div className="col-span-2 md:col-span-1">
                <label className="text-[11px] font-semibold text-[#6E7F94] uppercase tracking-wider block mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  min={today}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="clay-input w-full px-2 py-2 text-[13px] font-semibold text-[#0D1117] cursor-pointer"
                />
              </div>

              {/* Start time */}
              <TimePicker
                label="Start"
                value={startTime}
                onChange={handleStartChange}
                minMins={slotStartMins}
                maxMins={slotEndMins - 30}
              />

              {/* End time */}
              <TimePicker
                label="End"
                value={endTime}
                onChange={handleEndChange}
                minMins={startTime ? timeToMinutes(startTime) + 30 : slotStartMins + 30}
                maxMins={slotEndMins === 1440 ? 1439 : slotEndMins}
              />
            </div>

            {/* Time error */}
            {timeError && <ErrorBox msg={timeError} />}

            {/* Price preview */}
            {!timeError && durationH >= 0.5 && (
              <div className="clay-raised-sm flex items-center justify-between px-4 py-2.5 mt-3" style={{ background: 'rgba(30,92,255,0.06)' }}>
                <div>
                  <div className="text-[11px] text-[#6E7F94]">Estimated total</div>
                  {previewLoading
                    ? <div className="mt-1 h-3.5 w-24 rounded bone-shimmer" />
                    : pricePreview
                      ? <div className="text-[11px] text-[#9AACBE]">
                          {durationH.toFixed(1)} hr × ₹{pricePreview.hourlyRate}/hr
                        </div>
                      : null}
                </div>
                {previewLoading
                  ? <Loader2 className="w-5 h-5 text-[#1E5CFF] animate-spin" />
                  : pricePreview
                    ? <span className="text-[22px] font-bold text-[#1E5CFF]">₹{pricePreview.amount}</span>
                    : null}
              </div>
            )}
          </div>

          {/* ── Seat Map ──────────────────────────────────────────────── */}
          {bookingOpen && (
            <div className="px-4 pb-4 pt-4" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.2)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest">
                  Pick a Seat
                </p>
                <span className="text-[10px] text-[#0D7C54] font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0D7C54] animate-pulse inline-block" />
                  Updates live
                </span>
              </div>

              <SeatGrid
                seats={seats}
                selectedId={selectedSeatId}
                onSelect={(id) => { setSelectedSeatId(id || null); setSeatError(''); setPayError('') }}
                loading={seatsLoading}
              />

              {seatError && <div className="mt-3"><ErrorBox msg={seatError} /></div>}

              {/* Selected seat pill */}
              {selectedSeat && (
                <div className="clay-raised-sm mt-3 flex items-center justify-between px-4 py-2.5" style={{ background: 'rgba(30,92,255,0.05)' }}>
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

              {/* Pay error */}
              {payError && <div className="mt-3"><ErrorBox msg={payError} /></div>}

              {/* Pay CTA */}
              <button
                type="button"
                onClick={handlePay}
                disabled={!canPay}
                className="clay-btn-primary mt-4 w-full py-3.5 text-[14px] font-bold flex items-center justify-center gap-2 disabled:cursor-not-allowed"
              >
                {payLoading || isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : <><CreditCard className="w-4 h-4" /> Pay ₹{pricePreview?.amount ?? '—'}</>}
              </button>

              {pricePreview && !payLoading && (
                <p className="text-center text-[11px] text-[#9AACBE] mt-2">
                  Seat held for 15 min after clicking Pay
                </p>
              )}
            </div>
          )}

          {/* "Open booking" prompt when panel is closed */}
          {!bookingOpen && hasAnySlots && (
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setBookingOpen(true)}
                className="clay-btn-primary w-full py-3.5 text-[14px] font-bold flex items-center justify-center gap-2"
              >
                See Available Seats <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Books Catalogue ───────────────────────────────────────────── */}
      {books.length > 0 && (
        <div className="clay-raised p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-[#0D1117]">📚 Books Available</div>
            <span className="text-[11px] text-[#6E7F94]">{books.length} title{books.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Search within this library's catalog */}
          <input
            value={bookQuery}
            onChange={e => {
              const q = e.target.value.toLowerCase()
              setBookQuery(e.target.value)
              if (!q.trim()) {
                setBookResults(books)
              } else {
                setBookResults(books.filter(b =>
                  b.title.toLowerCase().includes(q) ||
                  (b.author ?? '').toLowerCase().includes(q) ||
                  (b.isbn  ?? '').toLowerCase().includes(q)
                ))
              }
            }}
            placeholder="Search by title, author, or ISBN…"
            className="clay-input w-full px-3 py-2 text-[12px] mb-3"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          />

          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {bookResults.length === 0 && (
              <div className="text-[12px] text-[#9AACBE] text-center py-4">No books match your search</div>
            )}
            {bookResults.map(b => {
              const isRequested = requestedIds.has(b.id)
              const isRequesting = requestingId === b.id
              return (
                <div
                  key={b.id}
                  className="clay-raised-sm clay-interactive flex items-center justify-between gap-3 py-2 px-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#0D1117] truncate">{b.title}</div>
                    {b.author && <div className="text-[11px] text-[#9AACBE] mt-0.5">{b.author}</div>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`clay-chip text-[10px] font-bold px-2 py-0.5 ${
                        b.available_copies > 0
                          ? 'bg-[#ECFDF5] text-[#059669]'
                          : 'bg-[#FEF2F2] text-[#DC2626]'
                      }`}>
                        {b.available_copies > 0 ? `${b.available_copies} available` : 'Not available'}
                      </span>
                      <span className="text-[10px] text-[#9AACBE]">{b.total_copies} cop{b.total_copies !== 1 ? 'ies' : 'y'}</span>
                    </div>

                    {requestMsgId === b.id && (
                      <div className="text-[11px] text-[#059669] mt-1 font-medium">✓ Request sent! Staff will contact you.</div>
                    )}
                    {requestErrId === b.id && (
                      <div className="text-[11px] text-[#DC2626] mt-1">{requestErrMsg}</div>
                    )}
                  </div>

                  <button
                    disabled={isRequesting || isRequested}
                    onClick={async () => {
                      setRequestingId(b.id)
                      setRequestMsgId(null)
                      setRequestErrId(null)
                      const res = await requestBook({ bookId: b.id, libraryId: library.id })
                      setRequestingId(null)
                      if (res.success) {
                        setRequestedIds(prev => new Set([...prev, b.id]))
                        setRequestMsgId(b.id)
                        setTimeout(() => setRequestMsgId(null), 4000)
                      } else {
                        setRequestErrId(b.id)
                        setRequestErrMsg(res.success === false ? res.error : 'Failed to send request')
                        setTimeout(() => setRequestErrId(null), 4000)
                      }
                    }}
                    className="clay-raised-sm flex-shrink-0 px-3 py-1.5 text-[11px] font-bold"
                    style={{
                      background: isRequested ? '#ECFDF5' : undefined,
                      color:      isRequested ? '#059669' : '#1E5CFF',
                      cursor:     isRequesting || isRequested ? 'default' : 'pointer',
                      opacity:    isRequesting ? 0.7 : 1,
                    }}
                  >
                    {isRequesting ? '…' : isRequested ? '✓ Requested' : 'Request'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Membership Plans ─────────────────────────────────────────── */}
      {plans.length > 0 && (
        <div className="clay-raised p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-[#0D1117]">Membership Plans</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {plans.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  'clay-interactive rounded-[10px] p-3 text-center cursor-pointer',
                  i === 1 ? 'clay-pressed' : 'clay-raised-sm',
                )}
                style={i === 1 ? { background: 'linear-gradient(150deg,#F0F5FF,#F8FAFF)' } : undefined}
                onClick={() => setSubscribePlan(p)}
              >
                {i === 1 && <div className="text-[9px] font-bold text-[#1E5CFF] mb-0.5">⭐ Popular</div>}
                <div className="text-[12px] font-bold text-[#0D1117]">{p.name}</div>
                <div className="text-[20px] font-extrabold my-0.5" style={{ color: PLAN_COLORS[i % PLAN_COLORS.length] }}>
                  ₹{p.price}
                </div>
                <div className="text-[10px] text-[#6E7F94]">{p.duration_days} days</div>
                {(p.time_window_start && p.time_window_end) || describeDaysOfWeek(p.days_of_week) ? (
                  <div className="text-[9.5px] text-[#92400E] font-semibold mt-0.5">
                    🕐 {[
                      p.time_window_start && p.time_window_end ? `${p.time_window_start.slice(0, 5)}–${p.time_window_end.slice(0, 5)}` : null,
                      describeDaysOfWeek(p.days_of_week),
                    ].filter(Boolean).join(' · ')} only
                  </div>
                ) : null}
                <div className="mt-2 text-[10px] text-[#1E5CFF] font-medium">Subscribe →</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5 items-stretch">
        {[
          { icon: Users,    label: 'Free Seats', value: isOpen ? `${freeSeats}` : '—' },
          { icon: Calendar, label: 'Today',      value: status.todayHoursLabel },
          { icon: Star,     label: 'Rating',     value: `${library.rating.toFixed(1)}/5` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="clay-raised p-3 text-center flex flex-col items-center justify-center">
            <Icon className="w-4 h-4 text-[#9AACBE] mb-1" />
            {/* WebkitLineClamp (not Tailwind's line-clamp utility, to
                avoid depending on whether that core utility is enabled in
                this project's Tailwind version) caps a long value like
                the "Today" hours string to 2 lines with an ellipsis,
                instead of letting it wrap to 5+ lines and force the
                Free Seats/Rating cards in the same grid row to stretch
                to match — that mismatch was the actual bug: a short "8"
                sitting inside a card that was only tall because its
                neighbor's text was long. */}
            <div
              className="text-[13px] font-bold text-[#0D1117] leading-tight"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {value}
            </div>
            <div className="text-[10px] text-[#9AACBE] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Address ───────────────────────────────────────────────────── */}
      <div className="clay-raised p-4">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#0D1117] mb-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#9AACBE]" /> Location
        </div>
        <div className="text-[13px] text-[#6E7F94]">{library.address}</div>
      </div>

      {/* ── Sticky CTA (collapsed state — opens panel) ────────────────── */}
      {/* {!bookingOpen && hasAnySlots && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-[252px] bg-white/95 backdrop-blur-sm border-t border-[#E4EAF2] px-5 py-4 z-50">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-[#0D1117] truncate">{library.name}</div>
              <div className="text-[11px] text-[#6E7F94]">
                {isOpen
                  ? freeSeats > 0
                    ? `${freeSeats} seats free${price ? ` · from ₹${price.rate}/hr` : ''}`
                    : 'All seats taken — try a different time'
                  : `Closed now · ${status.todayHoursLabel}`}
              </div>
            </div>
            <button
              onClick={() => {
                setBookingOpen(true)
                // Scroll to booking panel
                setTimeout(() => {
                  document.querySelector('[data-booking-panel]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
              }}
              className="flex-shrink-0 px-6 py-3 rounded-xl text-[14px] font-bold bg-[#1E5CFF] text-white shadow-[0_4px_24px_rgba(30,92,255,.3)] hover:bg-[#1447D4] hover:-translate-y-px transition-all"
            >
              Book Seat →
            </button>
          </div>
        </div>
      )} */}

      {subscribePlan && (
        <SubscribeModal
          plan={subscribePlan}
          libraryId={library.id}
          libraryName={library.name}
          onClose={() => setSubscribePlan(null)}
        />
      )}
    </div>
  )
}