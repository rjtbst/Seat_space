// components/student/MapView.tsx
'use client'

/**
 * Map view for the Explore page.
 *
 * Uses Google Maps JavaScript API loaded dynamically (no npm package needed).
 * Falls back to static Google Maps links if API key is not set.
 *
 * ENV: NEXT_PUBLIC_GOOGLE_MAPS_KEY — optional; without it we render
 *      a list of "Open in Maps" links instead.
 *
 * Each library card is clickable — shows an info window with name,
 * distance, price, seats, and a "View & Book" link.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { LibraryCard } from '@/lib/actions/students/student-discovery'
import { effectiveSlotRate } from '@/lib/booking/types'
import { Navigation2, MapPin, ExternalLink, Loader2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

declare global {
  interface Window {
    google:              any
    initLibraryMap:      () => void
    _googleMapsLoading:  boolean
    _googleMapsReady:    boolean
  }
}

interface Props {
  libraries: LibraryCard[]
  userLat:   number | null
  userLng:   number | null
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

/**
 * SLOT-ONLY ARCHITECTURE — same pricing/status logic as LibraryCard.tsx's
 * priceDisplay(). There is no single library price or open/close pair
 * anymore (see lib/booking/libraryStatus.ts) — status.isOpen and
 * status.todayHoursLabel are the single source of truth, and price is
 * derived from the cheapest (or currently-active) slot rate.
 */
function priceDisplay(library: LibraryCard): { label: string; rate: number } | null {
  const activeSlots = library.slots.filter((s) => s.is_active)
  if (activeSlots.length === 0) return null

  if (library.status.isOpen && library.status.currentSlot) {
    return { label: 'Now', rate: effectiveSlotRate(library.status.currentSlot) }
  }

  const lowest = [...activeSlots].sort(
    (a, b) => effectiveSlotRate(a) - effectiveSlotRate(b),
  )[0]
  return { label: 'From', rate: effectiveSlotRate(lowest) }
}

// ── Fallback: no API key → show list with "Open in Maps" links ────────────────
function MapFallback({ libraries, userLat, userLng }: Props) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 bg-[#F4F7FB]">
      <div className="flex items-start gap-2 bg-[#FEF3C7] rounded-xl p-3">
        <AlertCircle className="w-4 h-4 text-[#B45309] flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-[#92400E]">
          Map view requires <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>. Showing list view instead.
        </p>
      </div>
      {libraries.map((lib) => {
        const mapsUrl = lib.latitude && lib.longitude
          ? `https://www.google.com/maps/search/?api=1&query=${lib.latitude},${lib.longitude}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lib.name, lib.area, lib.city].filter(Boolean).join(', '))}`
        const open  = lib.status.isOpen
        const price = priceDisplay(lib)
        return (
          <div key={lib.id} className="bg-white rounded-xl border border-[#E4EAF2] p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#0D1117] truncate">{lib.name}</p>
              <p className="text-[11px] text-[#9AACBE] truncate">{[lib.area, lib.city].filter(Boolean).join(', ')}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('text-[10px] font-semibold', open ? 'text-[#0D7C54]' : 'text-[#9AACBE]')}>
                  {open ? '● Open' : '○ Closed'}
                </span>
                {price && (
                  <span className="text-[10px] text-[#9AACBE]">{price.label} ₹{price.rate}/hr</span>
                )}
                {lib.distance_km != null && (
                  <span className="text-[10px] text-[#9AACBE]">{lib.distance_km} km</span>
                )}
              </div>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-[#E8EFFE] text-[#1246FF] rounded-lg text-[11px] font-semibold hover:bg-[#1246FF] hover:text-white transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Maps
            </a>
          </div>
        )
      })}
    </div>
  )
}

// ── Google Maps implementation ────────────────────────────────────────────────
export default function MapView({ libraries, userLat, userLng }: Props) {
  const mapRef       = useRef<HTMLDivElement>(null)
  const mapInstance  = useRef<any>(null)
  const markersRef   = useRef<any[]>([])
  const infoWindowRef = useRef<any>(null)
  const [loading, setLoading]         = useState(true)
  const [error,   setError]           = useState('')
  const [selected, setSelected]       = useState<LibraryCard | null>(null)

  if (!MAPS_KEY) {
    return <MapFallback libraries={libraries} userLat={userLat} userLng={userLng} />
  }

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return

    // Centre: user location or first library or Delhi
    const centre = userLat != null && userLng != null
      ? { lat: userLat, lng: userLng }
      : libraries[0]?.latitude != null && libraries[0]?.longitude != null
        ? { lat: Number(libraries[0].latitude), lng: Number(libraries[0].longitude) }
        : { lat: 28.6139, lng: 77.2090 }

    const map = new window.google.maps.Map(mapRef.current, {
      center:            centre,
      zoom:              13,
      disableDefaultUI:  true,
      zoomControl:       true,
      mapTypeControl:    false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
      ],
    })

    mapInstance.current  = map
    infoWindowRef.current = new window.google.maps.InfoWindow()

    // User location marker
    if (userLat != null && userLng != null) {
      new window.google.maps.Marker({
        position: { lat: userLat, lng: userLng },
        map,
        title: 'You are here',
        icon: {
          path:        window.google.maps.SymbolPath.CIRCLE,
          scale:       8,
          fillColor:   '#1246FF',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      })
    }

    // Library markers
    markersRef.current = libraries
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((lib) => {
        const open  = lib.status.isOpen
        const price = priceDisplay(lib)
        const marker = new window.google.maps.Marker({
          position: { lat: Number(lib.latitude), lng: Number(lib.longitude) },
          map,
          title: lib.name,
          icon: {
            path:        window.google.maps.SymbolPath.MAP_PIN,
            scale:       10,
            fillColor:   open ? '#0D7C54' : '#9AACBE',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        })

        marker.addListener('click', () => {
          setSelected(lib)
          infoWindowRef.current.setContent(`
            <div style="font-family:DM Sans,sans-serif;padding:4px;max-width:220px">
              <strong style="font-size:13px;color:#0D1117">${lib.name}</strong>
              <p style="font-size:11px;color:#6E7F94;margin:3px 0 0">${[lib.area, lib.city].filter(Boolean).join(', ')}</p>
              <div style="display:flex;gap:8px;margin-top:6px;font-size:11px">
                <span style="color:${open ? '#0D7C54' : '#9AACBE'}">${open ? '● Open' : '○ Closed'}</span>
                ${price ? `<span style="color:#6E7F94">${price.label} ₹${price.rate}/hr</span>` : ''}
                <span style="color:${lib.available_seats === 0 ? '#C5282C' : '#0D7C54'}">${lib.available_seats} seats free</span>
              </div>
              <a href="/library/${lib.id}" style="display:inline-block;margin-top:8px;padding:4px 12px;background:#1246FF;color:#fff;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none">
                View &amp; Book
              </a>
            </div>
          `)
          infoWindowRef.current.open(map, marker)
        })

        return marker
      })

    setLoading(false)
  }, [libraries, userLat, userLng])

  useEffect(() => {
    if (window._googleMapsReady) { initMap(); return }

    window.initLibraryMap = () => {
      window._googleMapsReady = true
      initMap()
    }

    if (!window._googleMapsLoading) {
      window._googleMapsLoading = true
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=initLibraryMap&loading=async`
      script.async = true
      script.defer = true
      script.onerror = () => setError('Failed to load Google Maps. Check your API key.')
      document.head.appendChild(script)
    }
  }, [initMap])

  return (
    <div className="relative h-full w-full bg-[#F4F7FB]">
      {/* Map container */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F4F7FB]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#1246FF]" />
            <p className="text-[13px] text-[#9AACBE]">Loading map…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-x-4 top-4 bg-[#FEE2E2] text-[#C5282C] px-4 py-3 rounded-xl text-[12px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Selected library card overlay (bottom) */}
      {selected && (
        <div className="absolute bottom-4 inset-x-4 bg-white rounded-2xl border border-[#E4EAF2] shadow-lg p-4 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-[#0D1117] truncate">{selected.name}</h3>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0',
                  selected.status.isOpen
                    ? 'bg-[#D1FAE5] text-[#0D7C54]'
                    : 'bg-[#F4F7FB] text-[#9AACBE]'
                )}>
                  {selected.status.isOpen ? '● Open' : '○ Closed'}
                </span>
              </div>
              <p className="text-[11px] text-[#9AACBE] mt-0.5 truncate">
                {[selected.area, selected.city].filter(Boolean).join(', ')}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px]">
                {(() => {
                  const price = priceDisplay(selected)
                  return price ? (
                    <span className="text-[#0D1117] font-semibold">{price.label} ₹{price.rate}/hr</span>
                  ) : (
                    <span className="text-[#9AACBE]">No slots configured</span>
                  )
                })()}
                <span className={cn('font-medium', selected.available_seats === 0 ? 'text-[#C5282C]' : 'text-[#0D7C54]')}>
                  {selected.available_seats} seats free
                </span>
                {selected.distance_km != null && (
                  <span className="flex items-center gap-1 text-[#9AACBE]">
                    <Navigation2 className="w-3 h-3" />
                    {selected.distance_km} km
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="w-7 h-7 rounded-lg bg-[#F4F7FB] flex items-center justify-center flex-shrink-0"
            >
              <X className="w-3.5 h-3.5 text-[#6E7F94]" />
            </button>
          </div>

          <div className="flex gap-2 mt-3">
            {selected.latitude && selected.longitude && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#F4F7FB] border border-[#E4EAF2] rounded-xl text-[12px] font-semibold text-[#0D1117] hover:border-[#1246FF] transition-colors"
              >
                <Navigation2 className="w-3.5 h-3.5" />
                Directions
              </a>
            )}
            <Link
              href={`/library/${selected.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1246FF] rounded-xl text-[12px] font-semibold text-white hover:bg-[#0E38CC] transition-colors"
            >
              View &amp; Book
            </Link>
          </div>
        </div>
      )}

      {/* Library count badge */}
      {!loading && (
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-[#E4EAF2] text-[11px] font-medium text-[#6E7F94]">
          {libraries.filter(l => l.latitude != null).length} libraries on map
        </div>
      )}
    </div>
  )
}