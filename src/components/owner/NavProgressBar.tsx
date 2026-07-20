'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { ACCENT } from '@/lib/constants/theme'

export function NavProgressBar() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible]   = useState(false)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  // Store as string to avoid object-reference churn from useSearchParams
  const prevRoute   = useRef(`${pathname}?${searchParams.toString()}`)

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    const current = `${pathname}?${searchParams.toString()}`
    if (current === prevRoute.current) return   // same route — ignore

    prevRoute.current = current
    // Route changed → finish bar
    stopTimer()
    setProgress(100)
    const t = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 400)
    return () => clearTimeout(t)
  }, [pathname, searchParams])   // searchParams.toString() is stable per render

  useEffect(() => {
    ;(window as any).__startNavProgress = () => {
      stopTimer()                // kill any previous interval first
      setVisible(true)
      setProgress(15)

      let p = 15
      timerRef.current = setInterval(() => {
        p = p + (90 - p) * 0.12
        setProgress(Math.min(p, 89))
      }, 200)
    }

    return stopTimer
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 3,
      zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: `linear-gradient(90deg, ${ACCENT}, #22D3A0)`,
        transition: progress === 100 ? 'width .15s ease' : 'width .2s ease',
        boxShadow: `0 0 8px ${ACCENT}`,
      }} />
    </div>
  )
}