// app/(student)/library/[id]/book/seat/page.tsx
/**
 * Seat-booking page — server component.
 *
 * Route: /book/:libraryId/seat
 *
 * Fetches:
 *   1. Library detail (name, status, slots) via getLibraryDetail
 *   2. Student profile (for Razorpay prefill) via getStudentProfile
 *
 * Passes everything to BookSeatClient which owns the three-step UI:
 *   Step 1 — choose a slot + pick start/end time (with live price preview)
 *   Step 2 — pick a seat from the 2-D SeatGrid
 *   Step 3 — confirm summary + Razorpay checkout
 *
 * The ?slot=<id> search param (set by LibraryDetail when a student clicks a
 * specific slot card) pre-selects that slot in Step 1.
 */

import { notFound, redirect } from 'next/navigation'
import { getLibraryDetail } from '@/lib/actions/students/student-discovery'
import { getStudentProfile } from '@/lib/actions/students/student-profile'
import BookSeatClient from '@/components/student/BookSeatClient'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: { id: string }
  searchParams: { slot?: string; lat?: string; lng?: string }
}

export default async function BookSeatPage({ params, searchParams }: PageProps) {
  const libraryId = params.id
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

  const [library, profile] = await Promise.all([
    getLibraryDetail(libraryId, lat, lng),
    getStudentProfile(),
  ])

  if (!library) notFound()

  // Library must have at least one active slot to be bookable
  const activeSlots = library.slots.filter((s) => s.is_active)
  if (activeSlots.length === 0) {
    redirect(`/library/${libraryId}`)
  }

  return (
    <BookSeatClient
      library={{
        id:          library.id,
        name:        library.name,
        city:        library.city,
        area:        library.area,
        address:     library.address,
        rating:      library.rating,
        cover_url:   library.cover_url,
        freeSeats:   library.available_seats,
        status:      library.status,
      }}
      slots={activeSlots}
      profile={profile}
      preselectedSlotId={searchParams.slot ?? null}
    />
  )
}