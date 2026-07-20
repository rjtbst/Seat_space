// components/student/ExtendBookingModal.tsx
'use client'

/**
 * Modal for extending an active booking's end time.
 *
 * Opened from:
 *   - NotificationBell (booking_expiring notification → "Extend →" button)
 *   - BookingsClient "Extend" button on active booking cards
 *
 * Flow:
 *   1. Load current booking details (seat, library, current end time)
 *   2. Student picks a new end time via AM/PM picker
 *   3. Live price preview for the extension delta
 *   4. initiateBookingExtension → Razorpay → confirmBookingExtension
 *   5. Success → modal closes, bookings list refreshes
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Clock, Loader2, AlertCircle, CheckCircle, CreditCard,
} from 'lucide-react'
import { useRazorpay } from '@/hooks/userazorpay'
import {
  initiateBookingExtension,
  confirmBookingExtension,
} from '@/lib/actions/students/student-bookings'
import { getBookingPricePreview } from '@/lib/actions/students/student-discovery'

/* ── Helpers ──────────────────────────────────────────────── */

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minsToHHMM(mins: number): string {
  const clamped = Math.min(mins, 23 * 60 + 59)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function fmt12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number)
  const a = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${a}`
}

function fmtDateTime(ist: string): string {
  // ist = "YYYY-MM-DDTHH:mm"
  try {
    return new Date(ist + '+05:30').toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch { return ist }
}

/* ── AM/PM Time Picker (same as BookSeatClient) ─────────── */

const MINUTE_OPTS = [0, 15, 30, 45]

function TimePicker({
  value, onChange, minMins, disabled,
}: {
  value: string; onChange: (v: string) => void
  minMins?: number; disabled?: boolean
}) {
  const totalMins = value ? timeToMinutes(value) : 0
  const h24 = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  const isPM = h24 >= 12
  const h12 = h24 % 12 || 12

  function emit(newH24: number, newMins: number) {
    onChange(minsToHHMM(newH24 * 60 + newMins))
  }

  const sel = [
    'bg-white border border-[#DDE4EE] rounded-lg px-2.5 py-2 text-[13px] font-semibold',
    'text-[#0D1117] outline-none focus:border-[#1E5CFF] transition-colors',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  ].join(' ')

  return (
    <div className="flex items-center gap-1.5">
      <select value={h12} disabled={disabled} className={sel}
        onChange={e => emit((Number(e.target.value) % 12) + (isPM ? 12 : 0), mins)}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-[#9AACBE] font-bold">:</span>
      <select value={mins} disabled={disabled} className={sel}
        onChange={e => emit(h24, Number(e.target.value))}>
        {MINUTE_OPTS.map(m => (
          <option key={m} value={m}
            disabled={minMins !== undefined && h24 * 60 + m <= minMins}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select value={isPM ? 'PM' : 'AM'} disabled={disabled} className={sel}
        onChange={e => emit((h12 % 12) + (e.target.value === 'PM' ? 12 : 0), mins)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

/* ── Main Modal ───────────────────────────────────────────── */

interface Props {
  bookingId: string
  onClose:   () => void
}

type BookingMeta = {
  id:           string
  seat_label:   string
  library_name: string
  library_id:   string
  start_time:   string    // "YYYY-MM-DDTHH:mm"
  end_time:     string    // "YYYY-MM-DDTHH:mm"
  status:       string
}

export default function ExtendBookingModal({ bookingId, onClose }: Props) {
  const router         = useRouter()
  const { openCheckout } = useRazorpay()

  const [booking, setBooking]       = useState<BookingMeta | null>(null)
  const [loadErr, setLoadErr]       = useState('')
  const [newEndTime, setNewEndTime] = useState('')   // "HH:MM"
  const [preview, setPreview]       = useState<{ amount: number; platformFee: number; totalPayable: number } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError]           = useState('')
  const [paying, setPaying]         = useState(false)
  const [success, setSuccess]       = useState(false)

  const previewTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── Load booking details ─────────────────────────────────
  useEffect(() => {
    async function load() {
      const { createBrowserSupabaseClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserSupabaseClient()

      const { data, error: err } = await supabase
        .from('bookings')
        .select(`
          id, start_time, end_time, status,
          seats(row_label, column_number),
          libraries(id, name)
        `)
        .eq('id', bookingId)
        .maybeSingle()

      if (err || !data) { setLoadErr('Could not load booking details.'); return }

      const d  = data as any
      const sl = d.seats
      const meta: BookingMeta = {
        id:           d.id,
        seat_label:   sl ? `${sl.row_label}${sl.column_number}` : '?',
        library_name: d.libraries?.name ?? 'Library',
        library_id:   d.libraries?.id   ?? '',
        start_time:   (d.start_time as string).slice(0, 16),
        end_time:     (d.end_time   as string).slice(0, 16),
        status:       d.status,
      }
      setBooking(meta)

      // Default new end = current end + 1 hour, or 30 min if near slot end
      const currentEndMins = timeToMinutes(meta.end_time.slice(11, 16))
      const defaultNewMins = Math.min(currentEndMins + 60, 23 * 60 + 59)
      setNewEndTime(minsToHHMM(defaultNewMins))
    }
    load()
  }, [bookingId])

  // ── Price preview (debounced 500ms) ─────────────────────
  const refreshPreview = useCallback((b: BookingMeta, endHHMM: string) => {
    clearTimeout(previewTimer.current)
    setError('')

    const currentEndMins = timeToMinutes(b.end_time.slice(11, 16))
    const newEndMins     = timeToMinutes(endHHMM)

    if (newEndMins <= currentEndMins) {
      setError('New end time must be after current end time')
      setPreview(null)
      return
    }
    if (newEndMins - currentEndMins < 15) {
      setError('Extension must be at least 15 minutes')
      setPreview(null)
      return
    }

    const dateStr    = b.end_time.slice(0, 10)   // "YYYY-MM-DD"
    const newEndIST  = `${dateStr}T${endHHMM}`

    setPreviewLoading(true)
    previewTimer.current = setTimeout(async () => {
      const res = await getBookingPricePreview(
        b.library_id,
        b.end_time,     // from current end (extension window start)
        newEndIST,
      )
      setPreviewLoading(false)
      if (res.success === false) {
        setError(res.error)
        setPreview(null)
      } else {
        setPreview({ amount: res.data.amount, platformFee: res.data.platformFee, totalPayable: res.data.totalPayable })
      }
    }, 500)
  }, [])

  useEffect(() => {
    if (booking && newEndTime) refreshPreview(booking, newEndTime)
  }, [newEndTime, booking, refreshPreview])

  // ── Pay ─────────────────────────────────────────────────
  async function handlePay() {
    if (!booking || !preview || !newEndTime) return
    setError('')
    setPaying(true)

    const dateStr   = booking.end_time.slice(0, 10)
    const newEndIST = `${dateStr}T${newEndTime}`

    const initRes = await initiateBookingExtension({
      bookingId,
      newEndTime: newEndIST,
    })

    if (initRes.success === false) {
      setError(initRes.error)
      setPaying(false)
      return
    }

    const { extensionAmount, razorpayOrderId, razorpayKeyId, libraryName } = initRes.data
    // extensionAmount is the gross total (library price + platform fee) — this is what's actually charged via Razorpay.

    openCheckout({
      orderId:     razorpayOrderId,
      keyId:       razorpayKeyId,
      amount:      extensionAmount,
      name:        libraryName,
      description: `Extend Seat ${booking.seat_label} to ${fmt12h(newEndTime)}`,
      onSuccess: async (paymentId, orderId, signature) => {
        const confirmRes = await confirmBookingExtension({
          bookingId,
          newEndTime:        newEndIST,
          razorpayOrderId:   orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        })
        if (confirmRes.success === false) {
          setError(confirmRes.error)
          setPaying(false)
          return
        }
        setSuccess(true)
        setPaying(false)
        router.refresh()
      },
      onDismiss: () => setPaying(false),
      onError:   (msg) => { setError(msg); setPaying(false) },
    })
  }

  const currentEndMins = booking ? timeToMinutes(booking.end_time.slice(11, 16)) : 0
  const newEndMins     = timeToMinutes(newEndTime)
  const extraMins      = Math.max(0, newEndMins - currentEndMins)

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F8]">
          <div>
            <div className="text-[14px] font-bold text-[#0D1117]">Extend Booking</div>
            {booking && (
              <div className="text-[11px] text-[#9AACBE] mt-0.5">
                Seat {booking.seat_label} · {booking.library_name}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-[#9AACBE] hover:text-[#6E7F94] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Loading state */}
          {!booking && !loadErr && (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#1E5CFF]" />
            </div>
          )}

          {/* Load error */}
          {loadErr && (
            <div className="flex items-center gap-2 text-[12px] text-[#C5282C] bg-[#FFF0F0] border border-[#FCA5A5] rounded-xl p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {loadErr}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="py-6 text-center space-y-3">
              <CheckCircle className="w-12 h-12 text-[#0D7C54] mx-auto" />
              <div className="text-[14px] font-bold text-[#0D1117]">Booking Extended!</div>
              <div className="text-[12px] text-[#6E7F94]">
                Your seat is now booked until {fmt12h(newEndTime)}.
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2.5 rounded-xl bg-[#1E5CFF] text-white text-[13px] font-bold"
              >
                Done
              </button>
            </div>
          )}

          {/* Main form */}
          {booking && !success && (
            <>
              {/* Current vs new time */}
              <div className="bg-[#F4F7FB] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#9AACBE]">Current end time</span>
                  <span className="font-semibold text-[#0D1117]">
                    {fmt12h(booking.end_time.slice(11, 16))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#9AACBE] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Started
                  </span>
                  <span className="font-medium text-[#6E7F94] text-[11px]">
                    {fmtDateTime(booking.start_time)}
                  </span>
                </div>
              </div>

              {/* New end time picker */}
              <div>
                <label className="text-[11px] font-semibold text-[#9AACBE] uppercase tracking-widest block mb-2">
                  New end time
                </label>
                <TimePicker
                  value={newEndTime}
                  onChange={setNewEndTime}
                  minMins={currentEndMins}
                  disabled={paying}
                />
                {extraMins > 0 && !error && (
                  <div className="text-[11px] text-[#9AACBE] mt-1.5">
                    +{extraMins < 60
                      ? `${extraMins} min`
                      : `${(extraMins / 60).toFixed(1)} hr`} extension
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-[#FFF0F0] border border-[#FCA5A5] rounded-xl px-3 py-2.5 text-[12px] text-[#C5282C]">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Price preview */}
              {!error && (
                <div className="bg-[rgba(30,92,255,0.05)] border border-[rgba(30,92,255,0.18)] rounded-xl px-4 py-3 space-y-2">
                  {previewLoading
                    ? (
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-[#6E7F94]">Extension charge</div>
                        <Loader2 className="w-4 h-4 animate-spin text-[#1E5CFF]" />
                      </div>
                    )
                    : preview
                      ? (
                        <>
                          <div className="flex justify-between text-[12px] text-[#6E7F94]">
                            <span>Extension</span>
                            <span>₹{preview.amount}</span>
                          </div>
                          <div className="flex justify-between text-[12px] text-[#6E7F94]">
                            <span>Platform fee</span>
                            <span>₹{preview.platformFee}</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-[rgba(30,92,255,0.15)] pt-2 mt-1">
                            <span className="text-[12px] font-bold text-[#0D1117]">Total payable</span>
                            <span className="text-[20px] font-bold text-[#1E5CFF]">₹{preview.totalPayable}</span>
                          </div>
                        </>
                      )
                      : (
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-[#6E7F94]">Extension charge</div>
                          <span className="text-[12px] text-[#9AACBE]">–</span>
                        </div>
                      )
                  }
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer CTA */}
        {booking && !success && (
          <div className="px-5 pb-5 pt-1">
            <button
              onClick={handlePay}
              disabled={paying || previewLoading || !preview || !!error}
              className="w-full py-3.5 rounded-xl bg-[#1E5CFF] text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(30,92,255,.3)] hover:bg-[#1447D4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {paying || previewLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {paying ? 'Processing…' : 'Calculating…'}</>
                : <><CreditCard className="w-4 h-4" /> Pay ₹{preview?.totalPayable ?? '–'} & Extend</>
              }
            </button>
            <p className="text-center text-[11px] text-[#9AACBE] mt-2">
              Secure payment via Razorpay
            </p>
          </div>
        )}
      </div>
    </div>
  )
}