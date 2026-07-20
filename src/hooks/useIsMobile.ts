'use client'
import { useState, useEffect } from 'react'

/**
 * SSR-safe breakpoint hook. Defaults to false on server so hydration matches.
 * Uses a single resize listener shared across all consumers via module-level ref.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)  // false = desktop default (SSR safe)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}