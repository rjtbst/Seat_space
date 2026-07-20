// app/(student)/library/[id]/page.tsx
/**
 * Library detail page — server component.
 *
 * Fetches library info, available books, and the current student profile
 * in parallel, then passes everything to LibraryDetailClient.
 *
 * LibraryDetailClien handles:
 *  - Image gallery
 *  - Amenities, hours, distance
 *  - Book Seat tab: datetime picker → SeatGrid → Razorpay checkout
 *  - Plans tab: membership subscription via Razorpay
 *  - Books tab: catalogue + request button
 *
 * Route: /library/:id
 */
import { notFound } from 'next/navigation'
import { getLibraryDetail } from '@/lib/actions/students/student-discovery'
import { getLibraryBooks } from '@/lib/actions/students/student-books'
import { getStudentProfile } from '@/lib/actions/students/student-profile'
import LibraryDetailClient from '@/components/student/LibraryDetailClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params:       { id: string }
  searchParams: { lat?: string; lng?: string }
}

export default async function LibraryDetailPage({ params, searchParams }: PageProps) {
  // Pass user's coordinates so the detail page can show distance
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

  const [library, books, profile] = await Promise.all([
    getLibraryDetail(params.id, lat, lng),
    getLibraryBooks(params.id),
    getStudentProfile(),
  ])

  // 404 if library doesn't exist or is inactive
  if (!library) notFound()

  return (
    <LibraryDetailClient
      library={library}
      books={books}
      profile={profile}
    />
  )
}