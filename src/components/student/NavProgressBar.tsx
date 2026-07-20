'use client'
// src/components/student/NavProgressBar.tsx
// Same pattern as owner/staff NavProgressBar — thin top progress bar that
// starts the instant a nav link is tapped, completing when the route
// actually changes. Pairs with the loading.tsx skeletons added across all
// student routes to make navigation feel immediate.
import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const ACCENT = '#1246FF'

export function StudentNavProgressBar() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible]   = useState(false)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevRoute = useRef(`${pathname}?${searchParams.toString()}`)

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    const current = `${pathname}?${searchParams.toString()}`
    if (current === prevRoute.current) return

    prevRoute.current = current
    stopTimer()
    setProgress(100)
    const t = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 400)
    return () => clearTimeout(t)
  }, [pathname, searchParams])

  useEffect(() => {
    ;(window as any).__startStudentNavProgress = () => {
      stopTimer()
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
        background: `linear-gradient(90deg, ${ACCENT}, #4A7CFF)`,
        transition: progress === 100 ? 'width .15s ease' : 'width .2s ease',
        boxShadow: `0 0 8px ${ACCENT}`,
      }} />
    </div>
  )
}
