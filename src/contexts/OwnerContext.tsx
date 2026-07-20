'use client'
import { createContext, useContext, useMemo } from 'react'
import type { OwnerLibrary } from '@/lib/actions/owner'

interface OwnerContextValue {
  ownerName:      string
  firstLibraryId: string | null
  libraries:      OwnerLibrary[]
}

const OwnerContext = createContext<OwnerContextValue | null>(null)

export function OwnerProvider({
  children,
  ownerName,
  firstLibraryId,
  libraries,
}: OwnerContextValue & { children: React.ReactNode }) {
  // Memoize so consumers only re-render when actual data changes
  const value = useMemo(
    () => ({ ownerName, firstLibraryId, libraries }),
    [ownerName, firstLibraryId, libraries],
  )

  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>
}

export function useOwner(): OwnerContextValue {
  const ctx = useContext(OwnerContext)
  if (!ctx) throw new Error('useOwner must be used inside <OwnerProvider>')
  return ctx
}