// hooks/useGeolocation.ts
'use client'

import { useState, useCallback } from 'react'

export type GeoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'granted'; lat: number; lng: number; accuracy: number }
  | { status: 'denied';  reason: string }

const CACHE_KEY = 'ls_geo'
const CACHE_TTL = 10 * 60 * 1000   // 10 minutes


function readCache(): { lat: number; lng: number } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { lat, lng, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return { lat, lng }
  } catch { return null }
}

function writeCache(lat: number, lng: number) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lng, ts: Date.now() }))
  } catch { /* ignore quota errors */ }
}

export function useGeolocation() {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ status: 'denied', reason: 'Geolocation not supported by your browser' })
      return
    }

    // Return cached position immediately
    const cached = readCache()
    if (cached) {
      setGeo({ status: 'granted', lat: cached.lat, lng: cached.lng, accuracy: 0 })
      return
    }

    setGeo({ status: 'loading' })

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        writeCache(lat, lng)
        setGeo({ status: 'granted', lat, lng, accuracy })
      },
      (err) => {
        const reasons: Record<number, string> = {
          1: 'Location permission denied. Enable it in browser settings.',
          2: 'Location unavailable. Check your connection.',
          3: 'Location request timed out.',
        }
        setGeo({ status: 'denied', reason: reasons[err.code] ?? 'Unknown location error' })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: CACHE_TTL },
    )
  }, [])

  return { geo, request }
}