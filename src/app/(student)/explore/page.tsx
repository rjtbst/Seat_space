// app/(student)/explore/page.tsx
import { Suspense } from 'react'
import { cookies } from 'next/headers'
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

  let lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  let lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

  const hasExplicitCity = !!searchParams.city

  // ── Cookie-based location fallback ──────────────────────────────────
  // The URL is the source of truth when present (e.g. coming back from a
  // library detail page via a link that already carries lat/lng). When
  // it's NOT present — which happens on any fresh nav to /explore, like
  // tapping a bottom-nav tab — we used to have no idea the user already
  // granted location, so we'd render profile_city/profile_state first
  // and only switch to GPS after the client re-resolved geo and
  // re-fetched. That's the "searches city, then nearby, every time" bug.
  //
  // ExploreClient now writes `ls_loc` (lat,lng) and `ls_loc_pref` (on/off)
  // cookies whenever geo is granted or the user explicitly toggles Near
  // Me. Reading them here lets the very first server render already be
  // in GPS mode for a returning user — no flicker, no double fetch.
  const cookieStore = cookies()
  const locPref = cookieStore.get('ls_loc_pref')?.value // 'on' | 'off' | undefined

  if (lat == null && lng == null && !hasExplicitCity && locPref !== 'off') {
    const cached = cookieStore.get('ls_loc')?.value // "lat,lng"
    if (cached) {
      const [cLat, cLng] = cached.split(',').map(Number)
      if (Number.isFinite(cLat) && Number.isFinite(cLng)) {
        lat = cLat
        lng = cLng
      }
    }
  }

  // Fetch profile first so we can pass city/state as fallback to exploreLibraries
  const profile = await getStudentProfile()

  const hasGPS = lat != null && lng != null

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
      // Only pass profile fallbacks when no GPS (including cookie-derived
      // GPS) and no explicit city filter — otherwise the user is actively
      // filtering and we should respect that
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