// app/(student)/bookings/page.tsx
/**
 * My Bookings page — server component.
 *
 * Fetches upcoming and past bookings in parallel.
 * BookingsClient handles:
 *  - Tab switching (Upcoming / Past)
 *  - Cancel booking (with 30-min cutoff guard)
 *  - Status badges, amount paid, seat label
 *
 * Route: /bookings
 */
import { redirect }          from 'next/navigation'
import { getSupabaseUser }   from '@/lib/supabase/server'
import { getMyBookings }     from '@/lib/actions/students/student-bookings'
import BookingsClient        from '@/components/student/BookingsClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function BookingsPage() {
  const { user } = await getSupabaseUser()
  if (!user) redirect('/login?redirect=/bookings')

  const [upcoming, past] = await Promise.all([
    getMyBookings('upcoming'),
    getMyBookings('past'),
  ])

  return <BookingsClient upcoming={upcoming} past={past} />
}