'use client'

import { useEffect, useRef, useState } from 'react'
import type { SeatState } from './SeatGrid'

/**
 * Simulates ambient, believable activity across a seat grid: a few seats
 * hold, a held seat becomes booked, a booked seat occasionally gets
 * checked in. This is illustrative motion for the landing page, not a feed
 * of real bookings — it exists purely to keep the grid feeling live rather
 * than static, the same way the real dashboard's grid is never static
 * while a library is open.
 */
export function useAmbientSeats(
  total: number,
  opts: { freeRatio?: number; heldRatio?: number; bookedRatio?: number; tickMs?: number } = {}
) {
  const { freeRatio = 0.55, heldRatio = 0.12, bookedRatio = 0.28, tickMs = 1400 } = opts

  const [cells, setCells] = useState<SeatState[]>(() => {
    const arr: SeatState[] = []
    for (let i = 0; i < total; i++) {
      const r = Math.random()
      if (r < bookedRatio) arr.push('booked')
      else if (r < bookedRatio + heldRatio) arr.push('held')
      else if (r < bookedRatio + heldRatio + freeRatio) arr.push('free')
      else arr.push('checkedin')
    }
    return arr
  })

  const reduceMotion = useRef(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    if (reduceMotion.current) return

    const interval = setInterval(() => {
      setCells((prev) => {
        const next = [...prev]
        const idx = Math.floor(Math.random() * next.length)
        const current = next[idx]

        // Advance one seat along its natural sequence: free -> held -> booked -> checkedin -> free
        if (current === 'free') next[idx] = 'held'
        else if (current === 'held') next[idx] = 'booked'
        else if (current === 'booked') next[idx] = Math.random() > 0.5 ? 'checkedin' : 'booked'
        else if (current === 'checkedin') next[idx] = Math.random() > 0.7 ? 'free' : 'checkedin'
        else next[idx] = 'free'

        return next
      })
    }, tickMs)

    return () => clearInterval(interval)
  }, [tickMs])

  return cells
}
