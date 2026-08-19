// app/(student)/library/[id]/book/confirm/page.tsx
/**
 * Post-payment confirmation page.
 *
 * Route: /book/:libraryId/confirm?booking=<bookingId>
 *
 * Reached after BookSeatClient calls confirmBookingPayment and navigates
 * here. Shows a success screen with booking details fetched from the DB.
 * If no bookingId param is present, redirects to /explore.
 */

import { redirect } from 'next/navigation'
import { getMyBookings } from '@/lib/actions/students/student-bookings'
import Link from 'next/link'
import { CheckCircle, Calendar, Clock, MapPin, CreditCard } from 'lucide-react'

interface PageProps {
  params:       { libraryId: string }
  searchParams: { booking?: string }
}

function fmt12h(ist: string): string {
  const [, time = ''] = ist.split('T')
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  const a  = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${a}`
}

function fmtDate(ist: string): string {
  const [date = ''] = ist.split('T')
  const d = new Date(date + 'T00:00:00+05:30')
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function BookingConfirmPage({ searchParams }: PageProps) {
  const bookingId = searchParams.booking
  if (!bookingId) redirect('/explore')

  // Reuse getMyBookings and find our specific booking
  const bookings = await getMyBookings()
  const booking  = bookings.find((b) => b.id === bookingId)

  if (!booking) redirect('/bookings')

  return (
    <div className="min-h-screen flex items-start justify-center pt-10 px-4 pb-16" style={{ background: 'var(--clay-bg)' }}>
      <div className="w-full max-w-md">

        {/* Success card */}
        <div className="clay-raised overflow-hidden">

          {/* Top accent */}
          <div className="h-1.5 bg-gradient-to-r from-[#12A87A] via-[#1E5CFF] to-[#7C3AED]" />

          <div className="p-6 text-center">
            {/* Icon */}
            <div className="flex items-center justify-center mb-4">
              <div className="clay-raised w-16 h-16 !rounded-full flex items-center justify-center" style={{ background: '#E2F5EE' }}>
                <CheckCircle className="w-8 h-8 text-[#12A87A]" />
              </div>
            </div>

            <h1 className="text-xl font-bold text-[#0D1117] mb-1">Booking Confirmed!</h1>
            <p className="text-[13px] text-[#6E7F94]">
              Your seat is reserved. See you at {booking.library_name}.
            </p>

            {/* Booking ID badge */}
            <div className="clay-raised-sm mt-4 inline-flex items-center gap-2 px-4 py-2">
              <span className="text-[11px] text-[#9AACBE] font-medium">Booking ID</span>
              <span className="text-[12px] font-mono font-bold text-[#0D1117]">
                {booking.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Details */}
          <div>
            {[
              {
                icon: MapPin,
                label: 'Library',
                value: `${booking.library_name} · ${booking.library_area}, ${booking.library_city}`,
              },
              {
                icon: Calendar,
                label: 'Date',
                value: fmtDate(booking.start_time),
              },
              {
                icon: Clock,
                label: 'Time',
                value: `${fmt12h(booking.start_time)} – ${fmt12h(booking.end_time)}`,
              },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 px-6 py-4" style={{ boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.2)' }}>
                <Icon className="w-4 h-4 text-[#9AACBE] mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[11px] text-[#9AACBE] mb-0.5">{label}</div>
                  <div className="text-[13px] font-semibold text-[#0D1117]">{value}</div>
                </div>
              </div>
            ))}

            {/* Payment breakdown — same itemization shown at checkout */}
            <div className="flex items-start gap-3 px-6 py-4">
              <CreditCard className="w-4 h-4 text-[#9AACBE] mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-[11px] text-[#9AACBE] mb-1.5">Payment</div>
                {booking.amount_paid == null ? (
                  <div className="text-[13px] font-semibold text-[#0D1117]">—</div>
                ) : booking.base_amount != null ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[12px] text-[#6E7F94]">
                      <span>Seat</span>
                      <span>₹{booking.base_amount}</span>
                    </div>
                    <div className="flex justify-between text-[12px] text-[#6E7F94]">
                      <span>Platform fee</span>
                      <span>₹{booking.platform_fee}</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-bold text-[#0D1117] pt-1">
                      <span>Total paid</span>
                      <span>₹{booking.amount_paid}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[13px] font-semibold text-[#0D1117]">₹{booking.amount_paid}</div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-5 space-y-3">
            <Link
              href="/bookings"
              className="clay-btn-primary block w-full py-3 text-center text-[14px] font-bold"
            >
              View My Bookings
            </Link>
            <Link
              href="/explore"
              className="clay-raised-sm clay-interactive block w-full py-3 text-center text-[#3A4A5C] text-[13px] font-medium"
            >
              Explore More Libraries
            </Link>
          </div>
        </div>

        {/* Reminder */}
        <p className="mt-4 text-center text-[12px] text-[#9AACBE]">
          A confirmation has been recorded. Please carry a photo ID when you visit.
        </p>
      </div>
    </div>
  )
}