// components/student/ExploreClient.tsx
'use client'

import {
  useState, useCallback, useTransition, useRef, useEffect, lazy, Suspense,
} from 'react'
import { createPortal } from 'react-dom'
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
import { ClayButton, ClayChip, ClayIconBadge, ClayInput, ClaySelect, ClayToggleChip } from '@/components/ui/Clay'

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
const LOC_PREF_KEY = 'ls_loc_pref'

function readLocPref(): boolean | null {
  try {
    const stored = window.localStorage.getItem(LOC_PREF_KEY)
    // null = no stored preference yet (first-ever visit) — caller decides
    // the default in that case.
    return stored === null ? null : stored === 'on'
  } catch {
    return null
  }
}

function writeLocPref(enabled: boolean) {
  try {
    window.localStorage.setItem(LOC_PREF_KEY, enabled ? 'on' : 'off')
  } catch { /* ignore quota/availability errors */ }
}

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
      <div className="clay-raised-sm flex items-center gap-2 px-3 py-2 text-[11px] text-[#1246FF] font-medium" style={{ background: '#E8EFFE' }}>
        <Navigation className="w-3 h-3 flex-shrink-0" />
        Showing libraries nearest to you
      </div>
    )
  }
  if (mode === 'profile_city') {
    return (
      <div className="clay-raised-sm flex items-center justify-between gap-2 px-3 py-2 text-[11px]" style={{ background: '#D1FAE5' }}>
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
      <div className="clay-raised-sm flex items-center justify-between gap-2 px-3 py-2 text-[11px]" style={{ background: '#FEF3C7' }}>
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
      className="clay-raised-sm clay-interactive w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#6E7F94] hover:text-[#1246FF] text-left"
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
  // Guards the createPortal() call below — document doesn't exist during
  // SSR, so the portal target is only resolved once mounted client-side.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Location state ──────────────────────────────────────────
  // locEnabled tracks whether the user WANTS near-me sorting. It starts
  // `true` to match server-rendered output exactly (avoids a hydration
  // mismatch) -- if the user previously turned Near Me off, that's
  // corrected a moment later from localStorage, in the effect below.
  const [locEnabled, setLocEnabled] = useState(true)

  // On mount: apply any saved Near Me preference (localStorage isn't
  // available during SSR, so this necessarily happens client-side, after
  // the server-rendered fallback has already painted once) and, unless
  // the user explicitly turned it off last time, request geo. Previously
  // this fired unconditionally on every mount -- turning Near Me off and
  // then reloading the page silently turned it back on and re-navigated
  // to nearby results, overriding what the user had just chosen.
  useEffect(() => {
    const pref = readLocPref()
    if (pref === false) {
      setLocEnabled(false)
      return
    }
    requestGeo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.ceil(total / LIMIT)

  const navigate = useCallback((params: Record<string, string>, mode: 'push' | 'replace' = 'push') => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v) })
    const url = `${pathname}?${sp.toString()}`
    startTransition(() => {
      if (mode === 'replace') router.replace(url)
      else router.push(url)
    })
  }, [router, pathname])

  // ── Reads live geo coords so callers don't need to pass them explicitly ──
  const buildAndNavigate = useCallback((overrides: {
    q?: string; city?: string; open_now?: boolean; amenities?: string[]
    page?: number; lat?: number | null; lng?: number | null
    locEnabled?: boolean; mode?: 'push' | 'replace'
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
    }, overrides.mode ?? 'push')
  }, [q, city, openNow, selAmenities, locEnabled, geo, navigate])

  const handleSearch = useCallback((val: string) => {
    setQ(val)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => buildAndNavigate({ q: val }), 420)
  }, [buildAndNavigate])

  // Tracks whether the *next* geo grant was kicked off by an explicit
  // click (handleEnableLocation) rather than the silent automatic request
  // on mount. Both paths call requestGeo() and both eventually land in
  // the same effect below once geo resolves -- without this flag that
  // effect can't tell "user just clicked this" from "this happened
  // quietly in the background", and would use `replace` for both,
  // erasing the history entry from a deliberate click.
  const explicitEnableRef = useRef(false)

  // ── Location toggle ─────────────────────────────────────────
  // Turning OFF  → keep coords cached in geo, just stop sending them
  // Turning ON   → if already granted use immediately; otherwise request once
  // Either way this is a direct, deliberate user action, so it pushes a
  // normal history entry (unlike the automatic on-mount apply below) and
  // persists the choice so it's remembered on the next visit.
  const handleEnableLocation = useCallback(() => {
    if (locEnabled) {
      // User is turning Near Me OFF — fall back to city/state, don't clear geo cache
      explicitEnableRef.current = false
      setLocEnabled(false)
      writeLocPref(false)
      buildAndNavigate({ locEnabled: false, lat: null, lng: null })
      return
    }
    // User is turning Near Me ON
    setLocEnabled(true)
    writeLocPref(true)
    if (geo.status === 'granted') {
      // Coords already available — apply synchronously, no prompt
      buildAndNavigate({ locEnabled: true, lat: geo.lat, lng: geo.lng })
    } else {
      // Haven't asked yet (or was denied and user retries) — request
      // permission. Mark this as explicit so the effect below pushes
      // (not replaces) once it resolves.
      explicitEnableRef.current = true
      requestGeo()
    }
  }, [locEnabled, geo, buildAndNavigate, requestGeo])

  // ── When geo resolves (first grant) push coords immediately ──
  // This only fires on the transition to 'granted', not on every render.
  // locEnabled is intentionally not a dep — we read it via the closure
  // captured at grant-time, which is always true (we only call requestGeo
  // when locEnabled is being set to true).
  //
  // Mode depends on how this grant was triggered: the silent automatic
  // request on mount refines the page the user is already on (city
  // results → nearby results) and uses `replace` so it doesn't add a
  // back-button entry that just re-triggers the same transition on its
  // way "back". An explicit click on the Near Me toggle is a deliberate
  // action, though, and should behave like one -- `push`, so Back
  // actually undoes it -- even though the permission grant itself is
  // just as asynchronous either way.
  useEffect(() => {
    if (geo.status === 'granted' && locEnabled) {
      const mode = explicitEnableRef.current ? 'push' : 'replace'
      explicitEnableRef.current = false
      buildAndNavigate({ locEnabled: true, lat: geo.lat, lng: geo.lng, mode })
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
      <div className="flex-shrink-0 px-4 md:px-6 py-3 space-y-2.5" style={{ background: 'var(--clay-surface)', boxShadow: '0 4px 14px rgba(163,177,198,.25)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-bold text-[#0D1117]">Find a Library</h1>
            <p className="text-[11px] text-[#9AACBE]">{subtitle}</p>
          </div>
          <div className="clay-pressed flex items-center rounded-[11px] p-0.5">
            {(['list', 'map'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-[9px] text-[12px] font-semibold transition-all capitalize',
                  viewMode === m ? 'clay-raised-sm text-[#0D1117]' : 'text-[#9AACBE] hover:text-[#6E7F94]',
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
          <ClayInput
            type="text" value={q} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, city, area…"
            className="h-10 pl-9 pr-9"
          />
          {q && <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-[#9AACBE]" /></button>}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {/* Near Me pill — active by default, shows spinner while geo resolves */}
          <ClayToggleChip
            onClick={handleEnableLocation}
            active={locEnabled}
            className={locEnabled && geo.status === 'granted' ? 'text-[#0D7C54]' : undefined}
          >
            {geo.status === 'loading'
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Navigation className="w-3 h-3" />
            }
            {locEnabled && geo.status === 'granted' ? 'Near Me ✓' : 'Near Me'}
          </ClayToggleChip>

          <ClayToggleChip
            onClick={() => { setOpenNow(v => !v); buildAndNavigate({ open_now: !openNow }) }}
            active={openNow}
            className={openNow ? 'text-[#0D7C54]' : undefined}
          >
            <Clock className="w-3 h-3" />Open Now
          </ClayToggleChip>

          {selAmenities.map((a) => (
            <ClayChip key={a} tone="info" className="cursor-pointer" onClick={() => toggleAmenity(a)}>
              {a}<X className="w-2.5 h-2.5 ml-1" />
            </ClayChip>
          ))}

          <ClayToggleChip onClick={() => setShowFilters(v => !v)} active={showFilters}>
            <SlidersHorizontal className="w-3 h-3" />More
            {hasFilters && (
              <span className="w-4 h-4 rounded-full bg-[#1246FF] text-white text-[9px] font-bold flex items-center justify-center">
                {[!!q, !!city, openNow, selAmenities.length > 0].filter(Boolean).length}
              </span>
            )}
          </ClayToggleChip>

          {hasFilters && (
            <ClayButton variant="ghost" size="sm" onClick={clearAll} className="text-[#C5282C] hover:text-[#C5282C]">
              Clear all
            </ClayButton>
          )}
        </div>

        {/* Filter bottom-sheet — was previously an inline block here that
            pushed the library list down to a sliver of the screen when
            open, because it lived inside this header's flex-shrink-0 box
            within a fixed-height flex column shared with the list. Moving
            it to a portal means it overlays the screen instead of
            competing with the list for space, and it's no longer
            clipped/misplaced by any transformed ancestor (e.g. the page
            transition wrapper) since it renders directly under <body>. */}
        {mounted && showFilters && createPortal(
          <FilterSheet
            onClose={() => setShowFilters(false)}
            city={city}
            setCity={(v) => { setCity(v); buildAndNavigate({ city: v }) }}
            cities={cities}
            profileCity={profileCity}
            allAmenities={allAmenities}
            selAmenities={selAmenities}
            toggleAmenity={toggleAmenity}
            resultCount={total}
          />,
          document.body,
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
                <ClayIconBadge size="lg" className="mb-4">
                  <Search className="w-6 h-6 text-[#C4CDD8]" />
                </ClayIconBadge>
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
                  <ClayButton onClick={clearAll} className="mt-4">
                    {locationMode !== 'all' ? 'Show All Libraries' : 'Clear Filters'}
                  </ClayButton>
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
                      className="disabled:opacity-40"
                    >
                      <ClayIconBadge interactive size="md">
                        <ChevronLeft className="w-4 h-4 text-[#6E7F94]" />
                      </ClayIconBadge>
                    </button>
                    <span className="text-[13px] text-[#6E7F94] min-w-[100px] text-center">
                      Page {page} / {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => buildAndNavigate({ page: page + 1 })}
                      className="disabled:opacity-40"
                    >
                      <ClayIconBadge interactive size="md">
                        <ChevronRight className="w-4 h-4 text-[#6E7F94]" />
                      </ClayIconBadge>
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
            <div className="flex items-center justify-center h-full" style={{ background: 'var(--clay-bg)' }}>
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

/* ── Filter bottom-sheet ──────────────────────────────────────────────
   Portaled to document.body from the main component above. Slides up
   from the bottom (native app "filters" pattern) instead of the old
   inline panel that pushed the library list down to a sliver of the
   screen. Backdrop tap or the X closes it; changes apply immediately
   (same behavior as before — each control already calls
   buildAndNavigate/toggleAmenity directly), so there's no separate
   "Apply" step to get wrong. */
function FilterSheet({
  onClose, city, setCity, cities, profileCity, allAmenities, selAmenities, toggleAmenity, resultCount,
}: {
  onClose: () => void
  city: string
  setCity: (v: string) => void
  cities: string[]
  profileCity: string | null
  allAmenities: string[]
  selAmenities: string[]
  toggleAmenity: (a: string) => void
  resultCount: number
}) {
  // Lock background scroll while the sheet is open — otherwise the list
  // underneath can scroll behind the backdrop, which feels broken on touch.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="relative rounded-t-[22px] safe-bottom max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        style={{ background: 'var(--clay-surface)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ boxShadow: 'inset 0 -1px 0 rgba(163,177,198,.25)' }}>
          <span className="w-8" />
          <div className="w-9 h-1 rounded-full bg-[#E4EAF2] absolute left-1/2 -translate-x-1/2 top-2" />
          <h2 className="text-[15px] font-bold text-[#0D1117]">Filters</h2>
          <button onClick={onClose} aria-label="Close filters">
            <ClayIconBadge interactive size="sm">
              <X className="w-4 h-4 text-[#6E7F94]" />
            </ClayIconBadge>
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-[#9AACBE] uppercase tracking-wider mb-1.5">City</p>
            <ClaySelect value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All Cities</option>
              {profileCity && (
                <option value={profileCity}>{profileCity} (My City)</option>
              )}
              {cities
                .filter(c => c !== profileCity)
                .map(c => <option key={c} value={c}>{c}</option>)
              }
            </ClaySelect>
          </div>
          {allAmenities.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#9AACBE] uppercase tracking-wider mb-1.5">Amenities</p>
              <div className="flex flex-wrap gap-1.5">
                {allAmenities.map((a) => (
                  <ClayToggleChip
                    key={a}
                    onClick={() => toggleAmenity(a)}
                    active={selAmenities.includes(a)}
                    className="h-auto px-3 py-1.5 text-[12px]"
                  >
                    {a}
                  </ClayToggleChip>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4" style={{ boxShadow: 'inset 0 1px 0 rgba(163,177,198,.25)' }}>
          <ClayButton onClick={onClose} size="lg" className="w-full">
            Show {resultCount} {resultCount === 1 ? 'library' : 'libraries'}
          </ClayButton>
        </div>
      </div>
    </div>
  )
}