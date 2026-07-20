// src/components/student/LibraryDetailClient.tsx
/**
 * Server-component wrapper around LibraryDetail.
 *
 * Fetches the active subscription (user-specific, requires auth) then
 * renders the 'use client' LibraryDetail with everything it needs for
 * the unified inline booking flow:
 *   - library info, slots, status (from getLibraryDetail via page)
 *   - plans (from getLibraryDetail via page)
 *   - books (from getLibraryBooks via page)
 *   - activeSub (fetched here — user-specific)
 *   - profile (passed from page — for Razorpay prefill in inline booking)
 */

import LibraryDetail from './LibraryDetail'
import {
  getActiveSubscriptionForLibrary,
  type LibraryCard,
} from '@/lib/actions/students/student-discovery'
import type { LibraryBook } from '@/lib/actions/students/student-books'
import type { StudentProfile } from '@/lib/actions/students/student-profile'

export default async function LibraryDetailClient({
  library,
  books,
  profile,
}: {
  library: LibraryCard
  books:   LibraryBook[]
  profile: StudentProfile | null
}) {
  const activeSub = await getActiveSubscriptionForLibrary(library.id)

  return (
    <LibraryDetail
      library={{
        id:            library.id,
        name:          library.name,
        description:   library.description,
        city:          library.city,
        area:          library.area,
        address:       library.address,
        rating:        library.rating,
        total_reviews: library.total_reviews,
        amenities:     library.amenities,
        images:        library.image_urls,
      }}
      ownerSlots={library.slots}
      plans={library.plans}
      books={books}
      freeSeats={library.available_seats}
      status={library.status}
      activeSub={activeSub}
      profile={profile}
    />
  )
}
