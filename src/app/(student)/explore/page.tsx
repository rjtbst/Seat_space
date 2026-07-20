// app/(student)/explore/page.tsx
import { Suspense } from 'react'
import { exploreLibraries, getAllAmenities } from '@/lib/actions/students/student-discovery'
import { getStudentProfile } from '@/lib/actions/students/student-profile'
import ExploreClient from '@/components/student/ExploreClient'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: {
    q?:        string
    city?:     string
    area?:     string
    open_now?: string
    amenities?: string
    page?:     string
    lat?:      string
    lng?:      string
  }
}

export default async function ExplorePage({ searchParams }: Props) {
  const page      = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const amenities = searchParams.amenities
    ? searchParams.amenities.split(',').filter(Boolean)
    : []
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

  // Fetch profile first so we can pass city/state as fallback to exploreLibraries
  const profile = await getStudentProfile()

  const hasGPS         = lat != null && lng != null
  const hasExplicitCity = !!searchParams.city

  const [{ libraries, total, cities, location_mode }, allAmenities] = await Promise.all([
    exploreLibraries({
      lat,
      lng,
      search:   searchParams.q,
      city:     searchParams.city,
      area:     searchParams.area,
      open_now: searchParams.open_now === '1',
      amenities,
      radius_km : 50,
      page,
      limit: 12,
      // Only pass profile fallbacks when no GPS and no explicit city filter —
      // otherwise the user is actively filtering and we should respect that
      profile_city:  (!hasGPS && !hasExplicitCity) ? (profile?.city  ?? '') : '',
      profile_state: (!hasGPS && !hasExplicitCity) ? (profile?.state ?? '') : '',
    }),
    getAllAmenities(),
  ])
 
  return (
    <ExploreClient
      initialLibraries={libraries}
      total={total}
      cities={cities}
      allAmenities={allAmenities}
      locationMode={location_mode}
      profileCity={profile?.city   ?? null}
      profileState={profile?.state ?? null}
      initialFilters={{
        q:         searchParams.q      ?? '',
        city:      searchParams.city   ?? '',
        open_now:  searchParams.open_now === '1',
        amenities,
        lat,
        lng,
      }}
      page={page}
    />
  )
}