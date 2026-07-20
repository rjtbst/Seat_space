// components/student/ExploreClient.tsx
'use client'

import {
  useState, useCallback, useTransition, useRef, useEffect, lazy, Suspense,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { LibraryCard } from '@/lib/actions/students/student-discovery'
import LibraryCardTile from './LibraryCard'
import {
  Search, SlidersHorizontal, X, Clock,
  ChevronLeft, ChevronRight, Loader2, Navigation,
  AlertCircle, Map, List, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGeolocation } from '@/hooks/useGeolocation'

const MapView = lazy(() => import('./MapView'))

interface Props {
  initialLibraries: LibraryCard[]
  total:            number
  cities:           string[]
  allAmenities:     string[]
  profileCity:      string | null
  profileState:     string | null
  locationMode:     'gps' | 'profile_city' | 'profile_state' | 'all'
  initialFilters: {
    q:         string
    city:      string
    open_now:  boolean
    amenities: string[]
    lat?:      number
    lng?:      number
  }
  page: number
}

const LIMIT = 12

/* ─── Location mode banner ───────────────────────────────────── */
function LocationBanner({
  mode, profileCity, profileState, onEnableLocation,
}: {
  mode:             'gps' | 'profile_city' | 'profile_state' | 'all'
  profileCity:      string | null
  profileState:     string | null
  onEnableLocation: () => void
}) {
  if (mode === 'gps') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[#E8EFFE] rounded-xl border border-[#C7D7FD] text-[11px] text-[#1246FF] font-medium">
        <Navigation className="w-3 h-3 flex-shrink-0" />
        Showing libraries nearest to you
      </div>
    )
  }
  if (mode === 'profile_city') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#D1FAE5] rounded-xl border border-[#6EE7B7] text-[11px]">
        <span className="flex items-center gap-1.5 text-[#0A5E3F] font-medium">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          Showing libraries in <strong>{profileCity}</strong>
        </span>
        {/* <button
          onClick={onEnableLocation}
          className="flex-shrink-0 text-[#0D7C54] font-semibold underline underline-offset-2 hover:text-[#0A5E3F] transition-colors"
        >
          Enable location for better results
        </button> */}
      </div>
    )
  }
  if (mode === 'profile_state') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#FEF3C7] rounded-xl border border-[#FCD34D] text-[11px]">
        <span className="flex items-center gap-1.5 text-[#92400E] font-medium">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          Showing libraries in <strong>{profileState}</strong>
        </span>
        <button
          onClick={onEnableLocation}
          className="flex-shrink-0 text-[#B45309] font-semibold underline underline-offset-2 hover:text-[#92400E] transition-colors"
        >
          Enable location for better results
        </button>
      </div>
    )
  }
  // mode === 'all' — nudge to enable location
  return (
    <button
      onClick={onEnableLocation}
      className="w-full flex items-center gap-2 px-3 py-2 bg-[#F4F7FB] hover:bg-[#E8EFFE] rounded-xl border border-[#E4EAF2] hover:border-[#C7D7FD] text-[11px] text-[#6E7F94] hover:text-[#1246FF] transition-all text-left"
    >
      <Navigation className="w-3 h-3 flex-shrink-0" />
      Enable location to find nearest libraries
    </button>
  )
}

/* ─── Main component ─────────────────────────────────────────── */
export default function ExploreClient({
  initialLibraries, total, cities, allAmenities,
  profileCity, profileState, locationMode, initialFilters, page,
}: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { geo, request: requestGeo } = useGeolocation()

  const [viewMode,     setViewMode]     = useState<'list' | 'map'>('list')
  const [q,            setQ]            = useState(initialFilters.q)
  const [city,         setCity]         = useState(initialFilters.city)
  const [openNow,      setOpenNow]      = useState(initialFilters.open_now)
  const [selAmenities, setSelAmenities] = useState<string[]>(initialFilters.amenities)
  const [showFilters,  setShowFilters]  = useState(false)

  // ── Location state ──────────────────────────────────────────
  // locEnabled tracks whether the user WANTS near-me sorting.
  // It starts true (Near Me on by default) so we request geo immediately.
  // Once granted it is never cleared automatically — only by the user toggling.
  const [locEnabled, setLocEnabled] = useState(true)

  // Request geo on first mount so permission fires without the user tapping anything
  useEffect(() => {
    requestGeo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.ceil(total / LIMIT)

  const navigate = useCallback((params: Record<string, string>) => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v) })
    startTransition(() => router.push(`${pathname}?${sp.toString()}`))
  }, [router, pathname])

  // ── Reads live geo coords so callers don't need to pass them explicitly ──
  const buildAndNavigate = useCallback((overrides: {
    q?: string; city?: string; open_now?: boolean; amenities?: string[]
    page?: number; lat?: number | null; lng?: number | null
    locEnabled?: boolean
  } = {}) => {
    // Decide whether location should be active for this navigation
    const wantLoc = overrides.locEnabled !== undefined ? overrides.locEnabled : locEnabled
    const curLat  = wantLoc && geo.status === 'granted' ? geo.lat : null
    const curLng  = wantLoc && geo.status === 'granted' ? geo.lng : null
    navigate({
      q:        overrides.q         !== undefined ? overrides.q         : q,
      city:     overrides.city      !== undefined ? overrides.city      : city,
      open_now: (overrides.open_now !== undefined ? overrides.open_now  : openNow) ? '1' : '',
      amenities: (overrides.amenities !== undefined ? overrides.amenities : selAmenities).join(','),
      page:     String(overrides.page ?? 1),
      lat:      overrides.lat !== undefined
        ? (overrides.lat != null ? String(overrides.lat) : '')
        : (curLat != null ? String(curLat) : ''),
      lng:      overrides.lng !== undefined
        ? (overrides.lng != null ? String(overrides.lng) : '')
        : (curLng != null ? String(curLng) : ''),
    })
  }, [q, city, openNow, selAmenities, locEnabled, geo, navigate])

  const handleSearch = useCallback((val: string) => {
    setQ(val)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => buildAndNavigate({ q: val }), 420)
  }, [buildAndNavigate])

  // ── Location toggle ─────────────────────────────────────────
  // Turning OFF  → keep coords cached in geo, just stop sending them
  // Turning ON   → if already granted use immediately; otherwise request once
  const handleEnableLocation = useCallback(() => {
    if (locEnabled) {
      // User is turning Near Me OFF — fall back to city/state, don't clear geo cache
      setLocEnabled(false)
      buildAndNavigate({ locEnabled: false, lat: null, lng: null })
      return
    }
    // User is turning Near Me ON
    setLocEnabled(true)
    if (geo.status === 'granted') {
      // Coords already available — apply synchronously, no prompt
      buildAndNavigate({ locEnabled: true, lat: geo.lat, lng: geo.lng })
    } else {
      // Haven't asked yet (or was denied and user retries) — request permission
      requestGeo()
      // The effect below will push coords into the URL once granted
    }
  }, [locEnabled, geo, buildAndNavigate, requestGeo])

  // ── When geo resolves (first grant) push coords immediately ──
  // This only fires on the transition to 'granted', not on every render.
  // locEnabled is intentionally not a dep — we read it via the closure
  // captured at grant-time, which is always true (we only call requestGeo
  // when locEnabled is being set to true).
  useEffect(() => {
    if (geo.status === 'granted' && locEnabled) {
      buildAndNavigate({ locEnabled: true, lat: geo.lat, lng: geo.lng })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status])

  const toggleAmenity = (a: string) => {
    const next = selAmenities.includes(a) ? selAmenities.filter((x) => x !== a) : [...selAmenities, a]
    setSelAmenities(next)
    buildAndNavigate({ amenities: next })
  }

  // ── Clear all filters — NEVER wipes location ─────────────────
  const clearAll = () => {
    setQ(''); setCity(''); setOpenNow(false); setSelAmenities([])
    // Preserve locEnabled and any live coords — location is not a "filter"
    const lat = locEnabled && geo.status === 'granted' ? geo.lat : null
    const lng = locEnabled && geo.status === 'granted' ? geo.lng : null
    navigate({
      lat: lat != null ? String(lat) : '',
      lng: lng != null ? String(lng) : '',
    })
  }

  const hasFilters = !!q || !!city || openNow || selAmenities.length > 0
  const userLat    = geo.status === 'granted' && locEnabled ? geo.lat : null
  const userLng    = geo.status === 'granted' && locEnabled ? geo.lng : null

  // Subtitle text
  const subtitle =
    locationMode === 'gps'           ? `${total} spot${total !== 1 ? 's' : ''} · sorted by distance`
    : locationMode === 'profile_city'  ? `${total} spot${total !== 1 ? 's' : ''} in ${profileCity}`
    : locationMode === 'profile_state' ? `${total} spot${total !== 1 ? 's' : ''} in ${profileState}`
    : `${total} spot${total !== 1 ? 's' : ''}`

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 58px)' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-[#E4EAF2] px-4 md:px-6 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-bold text-[#0D1117]">Find a Library</h1>
            <p className="text-[11px] text-[#9AACBE]">{subtitle}</p>
          </div>
          <div className="flex items-center bg-[#F4F7FB] rounded-lg p-0.5 border border-[#E4EAF2]">
            {(['list', 'map'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-all capitalize',
                  viewMode === m ? 'bg-white text-[#0D1117] shadow-sm' : 'text-[#9AACBE] hover:text-[#6E7F94]',
                )}
              >
                {m === 'list' ? <List className="w-3.5 h-3.5" /> : <Map className="w-3.5 h-3.5" />}
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Location mode banner */}
        <LocationBanner
          mode={locationMode}
          profileCity={profileCity}
          profileState={profileState}
          onEnableLocation={handleEnableLocation}
        />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9AACBE] pointer-events-none" />
          <input
            type="text" value={q} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, city, area…"
            className="w-full h-10 pl-9 pr-9 bg-[#F4F7FB] border border-[#E4EAF2] rounded-xl text-[13px] text-[#0D1117] placeholder:text-[#9AACBE] focus:outline-none focus:border-[#1246FF] focus:bg-white transition-all"
          />
          {q && <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-[#9AACBE]" /></button>}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {/* Near Me pill — active by default, shows spinner while geo resolves */}
          <button
            onClick={handleEnableLocation}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all',
              locEnabled && geo.status === 'granted'
                ? 'bg-[#1246FF] border-[#1246FF] text-white'
                : geo.status === 'loading'
                  ? 'bg-[#F4F7FB] border-[#E4EAF2] text-[#9AACBE]'
                  : locEnabled
                    ? 'bg-[#E8EFFE] border-[#1246FF] text-[#1246FF]'  // enabled but not yet granted
                    : 'bg-white border-[#E4EAF2] text-[#6E7F94] hover:border-[#1246FF]',
            )}
          >
            {geo.status === 'loading'
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Navigation className="w-3 h-3" />
            }
            {locEnabled && geo.status === 'granted' ? 'Near Me ✓' : 'Near Me'}
          </button>

          <button
            onClick={() => { setOpenNow(v => !v); buildAndNavigate({ open_now: !openNow }) }}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all',
              openNow ? 'bg-[#D1FAE5] border-[#0D7C54] text-[#0D7C54]' : 'bg-white border-[#E4EAF2] text-[#6E7F94] hover:border-[#0D7C54]',
            )}
          >
            <Clock className="w-3 h-3" />Open Now
          </button>

          {selAmenities.map((a) => (
            <button key={a} onClick={() => toggleAmenity(a)}
              className="flex-shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#1246FF] text-white border border-[#1246FF] text-[11px] font-medium">
              {a}<X className="w-2.5 h-2.5" />
            </button>
          ))}

          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all',
              showFilters ? 'bg-[#E8EFFE] border-[#1246FF] text-[#1246FF]' : 'bg-white border-[#E4EAF2] text-[#6E7F94] hover:border-[#1246FF]',
            )}
          >
            <SlidersHorizontal className="w-3 h-3" />More
            {hasFilters && (
              <span className="w-4 h-4 rounded-full bg-[#1246FF] text-white text-[9px] font-bold flex items-center justify-center">
                {[!!q, !!city, openNow, selAmenities.length > 0].filter(Boolean).length}
              </span>
            )}
          </button>

          {hasFilters && (
            <button onClick={clearAll} className="flex-shrink-0 h-7 px-2.5 rounded-full border border-[#E4EAF2] text-[11px] text-[#C5282C] hover:bg-[#FEE2E2] transition-all">
              Clear all
            </button>
          )}
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="pt-2 border-t border-[#F4F7FB] space-y-3 animate-in slide-in-from-top-1 duration-150">
            <div>
              <p className="text-[10px] font-bold text-[#9AACBE] uppercase tracking-wider mb-1.5">City</p>
              <select
                value={city}
                onChange={(e) => { setCity(e.target.value); buildAndNavigate({ city: e.target.value }) }}
                className="w-full px-3 py-2 bg-[#F4F7FB] border border-[#E4EAF2] rounded-lg text-[13px] text-[#0D1117] focus:outline-none focus:border-[#1246FF] appearance-none cursor-pointer"
              >
                <option value="">All Cities</option>
                {/* Prioritise profile city at top */}
                {profileCity && (
                  <option value={profileCity}>{profileCity} (My City)</option>
                )}
                {cities
                  .filter(c => c !== profileCity)
                  .map(c => <option key={c} value={c}>{c}</option>)
                }
              </select>
            </div>
            {allAmenities.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#9AACBE] uppercase tracking-wider mb-1.5">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {allAmenities.map((a) => (
                    <button key={a} onClick={() => toggleAmenity(a)}
                      className={cn(
                        'px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all',
                        selAmenities.includes(a)
                          ? 'bg-[#1246FF] border-[#1246FF] text-white'
                          : 'bg-white border-[#E4EAF2] text-[#6E7F94] hover:border-[#1246FF]',
                      )}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Only show denied error — never show "enable location" nagging here */}
        {geo.status === 'denied' && (
          <div className="flex items-start gap-2 bg-[#FEF3C7] rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-[#B45309] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#92400E]">{geo.reason}</p>
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      {viewMode === 'list' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
            {isPending ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#1246FF]" />
                <p className="text-[13px] text-[#9AACBE]">Finding libraries…</p>
              </div>
            ) : initialLibraries.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#F4F7FB] flex items-center justify-center mb-4">
                  <Search className="w-6 h-6 text-[#C4CDD8]" />
                </div>
                <h3 className="text-[14px] font-semibold text-[#0D1117] mb-1">No libraries found</h3>
                <p className="text-[12px] text-[#9AACBE] max-w-xs">
                  {locationMode === 'profile_city'
                    ? `No libraries in ${profileCity} yet. Try searching another city.`
                    : locationMode === 'profile_state'
                      ? `No libraries in ${profileState} yet. Try searching another state.`
                      : hasFilters
                        ? 'Try adjusting your filters.'
                        : 'No libraries available right now.'}
                </p>
                {(hasFilters || locationMode !== 'all') && (
                  <button
                    onClick={clearAll}
                    className="mt-4 px-5 py-2.5 bg-[#1246FF] text-white rounded-xl text-[13px] font-semibold hover:bg-[#0E38CC] transition-colors"
                  >
                    {locationMode !== 'all' ? 'Show All Libraries' : 'Clear Filters'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {initialLibraries.map((lib) => (
                    <LibraryCardTile key={lib.id} library={lib} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <button
                      disabled={page <= 1}
                      onClick={() => buildAndNavigate({ page: page - 1 })}
                      className="w-9 h-9 rounded-xl border border-[#E4EAF2] bg-white flex items-center justify-center disabled:opacity-40 hover:border-[#1246FF] transition"
                    >
                      <ChevronLeft className="w-4 h-4 text-[#6E7F94]" />
                    </button>
                    <span className="text-[13px] text-[#6E7F94] min-w-[100px] text-center">
                      Page {page} / {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => buildAndNavigate({ page: page + 1 })}
                      className="w-9 h-9 rounded-xl border border-[#E4EAF2] bg-white flex items-center justify-center disabled:opacity-40 hover:border-[#1246FF] transition"
                    >
                      <ChevronRight className="w-4 h-4 text-[#6E7F94]" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full bg-[#F4F7FB]">
              <Loader2 className="w-6 h-6 animate-spin text-[#1246FF]" />
            </div>
          }>
            <MapView libraries={initialLibraries} userLat={userLat} userLng={userLng} />
          </Suspense>
        </div>
      )}
    </div>
  )
}