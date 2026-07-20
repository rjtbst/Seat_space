'use client'
import { useSearchParams } from 'next/navigation'
import { useOwner } from '@/contexts/OwnerContext'

/**
 * Returns the currently-selected library ID from the URL param,
 * falling back to the first library the owner has.
 */
export function useOwnerLibrary() {
  const { firstLibraryId, libraries } = useOwner()
  const params    = useSearchParams()
  const libParam  = params.get('lib')
  const libraryId = libParam ?? firstLibraryId

  const library = libraries.find(l => l.id === libraryId) ?? libraries[0] ?? null

  return { libraryId, library, libraries }
}