'use client'
import { useState, useCallback } from 'react'

/**
 * Shared toast hook. Replaces the 4 identical inline showToast patterns.
 * Usage:  const { toast, showToast } = useToast()
 */
export function useToast(duration = 2500) {
  const [toast, setToast] = useState<{ msg: string; ok?: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), duration)
  }, [duration])

  return { toast, showToast }
}