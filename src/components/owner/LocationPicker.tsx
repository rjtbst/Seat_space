// components/owner/LocationPicker.tsx
'use client'

/**
 * Location picker for library onboarding.
 * Two modes:
 *  1. "Use my location" — browser Geolocation API
 *  2. "Paste Google Maps link" — parse lat/lng from maps URL
 *
 * Emits onChange(lat, lng) when a valid location is set.
 */

import { useState } from 'react'
import { Navigation, MapPin, Link2, X, CheckCircle2, Loader2 } from 'lucide-react'

interface Props {
  lat:      number | null
  lng:      number | null
  onChange: (lat: number | null, lng: number | null) => void
}

/** Parse lat,lng from a Google Maps URL or "lat,lng" string */
function parseLatLng(input: string): { lat: number; lng: number } | null {
  // Format: https://maps.google.com/?q=28.6139,77.2090
  // Format: https://www.google.com/maps/place/.../data=...3d28.61394d77.20902...
  // Format: https://maps.app.goo.gl/... (short URL — can't parse, skip)
  // Simplest: try to find two numbers separated by comma
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,           // @lat,lng in URL
    /\?q=(-?\d+\.\d+),(-?\d+\.\d+)/,        // ?q=lat,lng
    /q=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,        // encoded comma
    /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/,     // plain "lat,lng"
    /place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/, // /place/name/@lat,lng
  ]

  for (const re of patterns) {
    const m = input.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng }
      }
    }
  }
  return null
}

type Mode = 'idle' | 'loading' | 'set' | 'error' | 'map-input'

export default function LocationPicker({ lat, lng, onChange }: Props) {
  const [mode,     setMode]     = useState<Mode>(lat != null ? 'set' : 'idle')
  const [error,    setError]    = useState('')
  const [mapsLink, setMapsLink] = useState('')

  function requestGeo() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      setMode('error')
      return
    }
    setMode('loading')
    setError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(
          parseFloat(pos.coords.latitude.toFixed(6)),
          parseFloat(pos.coords.longitude.toFixed(6)),
        )
        setMode('set')
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'Location access denied. Enable it in browser settings or paste a Maps link.',
          2: 'Location unavailable. Try pasting a Google Maps link instead.',
          3: 'Location request timed out. Please try again.',
        }
        setError(msgs[err.code] ?? 'Unable to get location')
        setMode('error')
      },
      { enableHighAccuracy: false, timeout: 8_000 },
    )
  }

  function handleMapsLink() {
    const parsed = parseLatLng(mapsLink.trim())
    if (!parsed) {
      setError('Could not read coordinates from this link. Try copying the URL from your browser address bar while viewing the location on maps.google.com.')
      return
    }
    setError('')
    onChange(parsed.lat, parsed.lng)
    setMode('set')
    setMapsLink('')
  }

  function clear() {
    onChange(null, null)
    setMode('idle')
    setError('')
    setMapsLink('')
  }

  // ── Shared style helpers ───────────────────────────────────────────
  const card  = 'border border-[#E2DDD4] rounded-xl p-4 bg-[#FDFCF9]'
  const label = 'text-[12px] font-semibold text-[#3A4A5C] block mb-1'
  const inp   = 'w-full px-3 py-2.5 bg-[#F4F7FB] border border-[#E4EAF2] rounded-lg text-[13px] text-[#0D1117] placeholder:text-[#9AACBE] focus:outline-none focus:border-[#1246FF] transition-colors'
  const btn   = 'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-colors'

  return (
    <div className={card}>
      <span className={label}>
        Library Location
        <span className="text-[#9AACBE] font-normal ml-1">(optional — helps students find you)</span>
      </span>

      {/* Set state */}
      {mode === 'set' && lat != null && lng != null && (
        <div className="flex items-center justify-between gap-3 mt-1">
          <div className="flex items-center gap-2 bg-[#D1FAE5] text-[#0D7C54] px-3 py-2 rounded-lg flex-1">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold">Location set</p>
              <p className="text-[10px] font-mono opacity-70 truncate">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            className="w-8 h-8 rounded-lg bg-white border border-[#E4EAF2] flex items-center justify-center hover:border-[#C5282C] hover:bg-[#FEE2E2] transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5 text-[#6E7F94]" />
          </button>
        </div>
      )}

      {/* Idle / error state */}
      {(mode === 'idle' || mode === 'error') && (
        <div className="space-y-2 mt-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={requestGeo}
              className={`${btn} bg-[#1246FF] text-white hover:bg-[#0E38CC] flex-1`}
            >
              <Navigation className="w-3.5 h-3.5" />
              Use My Location
            </button>
            <button
              type="button"
              onClick={() => { setMode('map-input'); setError('') }}
              className={`${btn} bg-[#F4F7FB] text-[#0D1117] border border-[#E4EAF2] hover:border-[#1246FF] flex-1`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Paste Maps Link
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-[#C5282C] bg-[#FEE2E2] px-3 py-2 rounded-lg leading-relaxed">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {mode === 'loading' && (
        <div className="flex items-center gap-2 mt-1 text-[13px] text-[#6E7F94]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Getting your location…
        </div>
      )}

      {/* Maps link input */}
      {mode === 'map-input' && (
        <div className="space-y-2 mt-1">
          <input
            type="url"
            value={mapsLink}
            onChange={(e) => setMapsLink(e.target.value)}
            placeholder="Paste Google Maps URL or lat,lng"
            className={inp}
            autoFocus
          />
          {error && (
            <p className="text-[11px] text-[#C5282C] leading-relaxed">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode('idle'); setError(''); setMapsLink('') }}
              className={`${btn} bg-[#F4F7FB] text-[#6E7F94] border border-[#E4EAF2]`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMapsLink}
              disabled={!mapsLink.trim()}
              className={`${btn} bg-[#1246FF] text-white hover:bg-[#0E38CC] disabled:opacity-50 disabled:cursor-not-allowed flex-1`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Set Location
            </button>
          </div>
          <p className="text-[10px] text-[#9AACBE]">
            Tip: On Google Maps, right-click your library location → copy the coordinates that appear.
          </p>
        </div>
      )}
    </div>
  )
}