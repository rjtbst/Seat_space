// app/(auth)/onboarding/add-library/page.tsx
import { Suspense } from 'react'
import { getLibraryForEdit } from '@/lib/actions/library'
import { getProfile } from '@/lib/actions/auth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guards'
import AddLibraryForm from '@/components/owner/AddLibraryForm'
import type { AmenityOption } from '@/components/owner/AddLibraryForm'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ id?: string }>
}

export default async function AddLibraryPage({ searchParams }: Props) {
  await requireRole('owner')

  const { id } = await searchParams
  const libraryId = id ?? null

  const supabase = await createServerSupabaseClient()

  const [existingLibrary, profile, amenitiesResult] = await Promise.all([
    libraryId ? getLibraryForEdit(libraryId) : Promise.resolve(null),
    getProfile(),
    supabase.from('amenities').select('id, name').order('name'),
  ])

  const amenities: AmenityOption[] = (amenitiesResult.data ?? [])
    .filter((a): a is { id: string; name: string } => a.name !== null)

  return (
    <Suspense fallback={null}>
      <AddLibraryForm
        libraryId={libraryId}
        existingLibrary={existingLibrary}
        profileState={profile?.state ?? ''}
        profileCity={profile?.city  ?? ''}
        amenities={amenities}
      />
    </Suspense>
  )
}