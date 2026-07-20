'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { animateCountUp } from '@/lib/utils'

/* ─────────────────────────────────────────
   useScrolled — detect if page has scrolled past threshold
───────────────────────────────────────── */
export function useScrolled(threshold = 20): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > threshold)
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [threshold])

  return scrolled
}

/* ─────────────────────────────────────────
   useCursor — track mouse & update custom cursor elements
   Only activates on pages that render <PageEffects />
───────────────────────────────────────── */
export function useCursor() {
  useEffect(() => {
    const dot  = document.getElementById('cursor-dot')
    const ring = document.getElementById('cursor-ring')
    if (!dot || !ring) return

    // Enable custom cursor only on this page
    document.body.classList.add('custom-cursor')

    let mouseX = 0, mouseY = 0
    let ringX  = 0, ringY  = 0
    let raf: number

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      dot.style.left = `${mouseX}px`
      dot.style.top  = `${mouseY}px`
    }

    const animate = () => {
      ringX += (mouseX - ringX) * 0.12
      ringY += (mouseY - ringY) * 0.12
      ring.style.left = `${ringX}px`
      ring.style.top  = `${ringY}px`
      raf = requestAnimationFrame(animate)
    }

    const onEnter = () => document.body.classList.add('cursor-hover')
    const onLeave = () => document.body.classList.remove('cursor-hover')

    window.addEventListener('mousemove', onMove)
    document.querySelectorAll('a, button, [data-cursor-hover]').forEach((el) => {
      el.addEventListener('mouseenter', onEnter)
      el.addEventListener('mouseleave', onLeave)
    })

    raf = requestAnimationFrame(animate)

    return () => {
      // Restore normal cursor when leaving this page
      document.body.classList.remove('custom-cursor', 'cursor-hover')
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])
}

/* ─────────────────────────────────────────
   useScrollReveal — IntersectionObserver for .reveal elements
───────────────────────────────────────── */
export function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal')
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

/* ─────────────────────────────────────────
   useCountUp — animate a number up on intersect
───────────────────────────────────────── */
export function useCountUp(target: number, duration = 1500) {
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const cleanup = animateCountUp(el, target, duration)
          obs.disconnect()
          return cleanup
        }
      },
      { threshold: 0.5 }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [target, duration])

  return ref
}

/* ─────────────────────────────────────────
   useMediaQuery
───────────────────────────────────────── */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])

  return matches
}

/* ─────────────────────────────────────────
   useIsDesktop
───────────────────────────────────────── */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}

/* ─────────────────────────────────────────
   useStickyNav — returns scrolled state for navbar
───────────────────────────────────────── */
export function useStickyNav() {
  return useScrolled(10)
}

/* ─────────────────────────────────────────
   useOutsideClick — fire callback when clicking outside ref
───────────────────────────────────────── */
export function useOutsideClick<T extends HTMLElement>(
  callback: () => void
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [callback])

  return ref
}

/* ─────────────────────────────────────────
   useLocalStorage
───────────────────────────────────────── */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(value))
        }
      } catch {
        console.warn(`useLocalStorage: failed to write key "${key}"`)
      }
    },
    [key]
  )

  return [storedValue, setValue]
}