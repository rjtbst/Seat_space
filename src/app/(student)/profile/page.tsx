// app/(student)/profile/page.tsx
/**
 * Profile page — server component.
 *
 * Fetches profile, stats, and 3 upcoming bookings in parallel.
 * ProfileClient handles:
 *  - Avatar with initials + gradient
 *  - Inline edit (name, city, state) with save/cancel
 *  - Stats grid (total sessions, this month, upcoming, active plans)
 *  - Next sessions preview with link to /bookings
 *  - Quick navigation links
 *  - Sign out
 *
 * Route: /profile
 */
import { redirect }              from 'next/navigation'
import { getSupabaseUser }       from '@/lib/supabase/server'
import {
  getStudentProfile,
  getStudentStats,
}                                from '@/lib/actions/students/student-profile'
import { getMyBookings }        from '@/lib/actions/students/student-bookings'
import ProfileClient             from '@/components/student/ProfileClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export default async function ProfilePage() {
  const { user } = await getSupabaseUser()
  if (!user) redirect('/login?redirect=/profile')

  const [profile, stats, upcoming] = await Promise.all([
    getStudentProfile(),
    getStudentStats(),
    getMyBookings('upcoming'),
  ])

  // Redundant guard — getStudentProfile() returns null only if unauthenticated
  if (!profile) redirect('/login?redirect=/profile')

  return (
    <ProfileClient
      profile={profile}
      stats={stats}
      upcomingBookings={upcoming.slice(0, 3)}
    />
  )
}