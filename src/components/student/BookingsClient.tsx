// components/student/BookingsClient.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { cancelBooking } from '@/lib/actions/students/student-bookings'
import type { StudentBooking } from '@/lib/actions/students/student-bookings'
import {
  Calendar, MapPin, Tag, CheckCircle2, XCircle,
  Clock3, Ban, AlertCircle, ChevronRight, QrCode,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { fmtIST, fmtISTTime } from '@/lib/ist'
import { BookingQRModal } from './BookingQRCode'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ClayCard, ClayChip, ClayButton, ClayToggleChip, ClayIconBadge } from '@/components/ui/Clay'

const STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' | 'danger'; Icon: typeof CheckCircle2 }> = {
  confirmed:  { label: 'Confirmed',   tone: 'success', Icon: CheckCircle2 },
  checked_in: { label: 'Checked In',  tone: 'info',     Icon: CheckCircle2 },
  held:       { label: 'Payment Pending', tone: 'warning', Icon: Clock3 },
  completed:  { label: 'Completed',   tone: 'neutral',  Icon: CheckCircle2 },
  cancelled:  { label: 'Cancelled',   tone: 'danger',   Icon: XCircle },
}

function BookingCard({
  booking,
  onCancel,
  onShowQR,
}: {
  booking:  StudentBooking
  onCancel: (id: string) => void
  onShowQR: (booking: StudentBooking) => void
}) {
  const cfg         = STATUS[booking.status] ?? STATUS.completed
  const StatusIcon  = cfg.Icon
  const startMs     = new Date(booking.start_time + '+05:30').getTime()
  const canCancel   =
    ['confirmed', 'held'].includes(booking.status) &&
    startMs - Date.now() > 30 * 60_000
  const canShowQR   = ['confirmed', 'checked_in'].includes(booking.status)

  return (
    <ClayCard interactive={false}>
      <div className="flex gap-3 p-4">
        {/* Thumbnail */}
        <div className="w-[66px] h-[66px] rounded-lg overflow-hidden bg-[#F0EDE8] flex-shrink-0">
          {booking.cover_url ? (
            <Image
              src={booking.cover_url}
              alt={booking.library_name}
              width={66} height={66}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">📚</div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-[#0D1117] leading-snug line-clamp-1">
              {booking.library_name}
            </h3>
            <ClayChip tone={cfg.tone} className="flex-shrink-0 gap-1">
              <StatusIcon className="w-2.5 h-2.5" />
              {cfg.label}
            </ClayChip>
          </div>

          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[#9AACBE]">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {[booking.library_area, booking.library_city].filter(Boolean).join(', ')}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-[#6E7F94]">
              <Calendar className="w-3 h-3" />
              <span>{fmtIST(booking.start_time)}</span>
              <span className="text-[#C4CDD8]">→</span>
              <span>{fmtISTTime(booking.end_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <ClayChip tone="neutral" className="gap-1">
                <Tag className="w-2.5 h-2.5" />
                Seat {booking.seat_label}
              </ClayChip>
              {booking.amount_paid != null && (
                booking.refunded_amount > 0 ? (
                  booking.refunded_amount >= booking.amount_paid ? (
                    <ClayChip className="font-medium bg-[#F3E8FF] text-[#6B3FD4]">
                      ₹{booking.amount_paid} refunded
                    </ClayChip>
                  ) : (
                    <ClayChip className="font-medium bg-[#F3E8FF] text-[#6B3FD4]">
                      ₹{booking.amount_paid - booking.refunded_amount} paid · ₹{booking.refunded_amount} refunded
                    </ClayChip>
                  )
                ) : (
                  <ClayChip tone="success" className="font-medium">
                    ₹{booking.amount_paid} paid
                  </ClayChip>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {(canCancel || canShowQR) && (
        <div className="px-4 py-2.5 flex items-center justify-between gap-2" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.2)' }}>
          {canShowQR ? (
            <button
              onClick={() => onShowQR(booking)}
              className="clay-raised-sm clay-interactive flex items-center gap-1.5 text-[11px] text-[#1246FF] px-3 py-1.5"
            >
              <QrCode className="w-3 h-3" />
              Show QR / Check-in
            </button>
          ) : <span />}

          {canCancel && (
            <button
              onClick={() => onCancel(booking.id)}
              className="clay-raised-sm clay-interactive flex items-center gap-1.5 text-[11px] text-[#C5282C] px-3 py-1.5"
            >
              <Ban className="w-3 h-3" />
              Cancel Booking
            </button>
          )}
        </div>
      )}

      {booking.status === 'held' && (
        <div className="px-4 py-2.5 flex items-start gap-2" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.2)' }}>
          <AlertCircle className="w-3.5 h-3.5 text-[#B45309] mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-[#92400E]">
            Payment pending. Complete payment before your seat hold expires.
          </p>
        </div>
      )}
    </ClayCard>
  )
}

export default function BookingsClient({
  upcoming,
  past,
}: {
  upcoming: StudentBooking[]
  past:     StudentBooking[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab]       = useState<'upcoming' | 'past'>('upcoming')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [qrBooking, setQrBooking] = useState<StudentBooking | null>(null)
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null)

  // Optimistic local mirror of the server props. A cancel updates this
  // instantly (status flips to 'cancelled' and the card slides from
  // "upcoming" to "past" before the server has responded) instead of
  // sitting in a dimmed/disabled state until router.refresh() re-fetches
  // everything. If the server rejects the cancellation we roll this back
  // to the last known-good props and surface the error — the person never
  // sees a state that wasn't actually true, they just don't have to wait
  // for the round trip to see the state they just caused.
  const [localUpcoming, setLocalUpcoming] = useState(upcoming)
  const [localPast, setLocalPast]         = useState(past)

  // Re-sync whenever the server gives us fresh props (e.g. after
  // router.refresh() reconciles in the background, or on next page load).
  useEffect(() => { setLocalUpcoming(upcoming) }, [upcoming])
  useEffect(() => { setLocalPast(past) }, [past])

  function handleCancel(id: string) {
    setPendingCancelId(id)
  }

  function confirmCancel() {
    const id = pendingCancelId
    if (!id) return
    setPendingCancelId(null)

    const target = localUpcoming.find((b) => b.id === id)
    if (!target) return

    // Snapshot for rollback, then apply the optimistic update immediately.
    const prevUpcoming = localUpcoming
    const prevPast     = localPast
    setLocalUpcoming((cur) => cur.filter((b) => b.id !== id))
    setLocalPast((cur) => [{ ...target, status: 'cancelled' }, ...cur])
    setCancelling(id)
    toast.success('Booking cancelled')

    startTransition(async () => {
      const result = await cancelBooking(id)
      setCancelling(null)
      if (result.success === false) {
        // Roll back — the cancellation didn't actually happen.
        setLocalUpcoming(prevUpcoming)
        setLocalPast(prevPast)
        toast.error(result.error)
        return
      }
      // Reconcile quietly with the server in the background; the UI
      // already reflects the right state so this won't cause a flash.
      router.refresh()
    })
  }

  const list = tab === 'upcoming' ? localUpcoming : localPast

  return (
    <div className="p-5 md:p-7 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[#0D1117]">My Bookings</h1>
        <p className="text-[13px] text-[#9AACBE] mt-0.5">
          {localUpcoming.length} upcoming · {localPast.length} past
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['upcoming', 'past'] as const).map((t) => (
          <ClayToggleChip
            key={t}
            onClick={() => setTab(t)}
            active={tab === t}
            className="h-auto px-4 py-2 capitalize"
          >
            {t}
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full',
              tab === t ? 'bg-[#E8EFFE] text-[#1246FF]' : 'bg-black/5 text-[#9AACBE]',
            )}>
              {t === 'upcoming' ? localUpcoming.length : localPast.length}
            </span>
          </ClayToggleChip>
        ))}
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <ClayIconBadge size="lg" className="mb-4">
            <Calendar className="w-6 h-6 text-[#C4CDD8]" />
          </ClayIconBadge>
          <h3 className="text-[14px] font-semibold text-[#0D1117] mb-1">
            No {tab} bookings
          </h3>
          <p className="text-[12px] text-[#9AACBE] max-w-xs">
            {tab === 'upcoming'
              ? 'Find a library and book a seat to get started.'
              : 'Your completed and cancelled sessions will appear here.'}
          </p>
          {tab === 'upcoming' && (
            <ClayButton onClick={() => router.push('/explore')} className="mt-4">
              Explore Libraries
            </ClayButton>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {list.map((b) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className={cn(cancelling === b.id && 'pointer-events-none')}
              >
                <BookingCard booking={b} onCancel={handleCancel} onShowQR={setQrBooking} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {qrBooking && (
        <BookingQRModal
          bookingId={qrBooking.id}
          libraryName={qrBooking.library_name}
          seatLabel={qrBooking.seat_label}
          onClose={() => setQrBooking(null)}
        />
      )}

      <ConfirmDialog
        open={!!pendingCancelId}
        title="Cancel this booking?"
        description="This cannot be undone."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="danger"
        busy={cancelling === pendingCancelId}
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancelId(null)}
      />
    </div>
  )
}