'use client'

import { useEffect } from 'react'
import { useCursor, useScrollReveal } from '@/hooks'

export default function PageEffects() {
  useCursor()
  useScrollReveal()
  return null
}