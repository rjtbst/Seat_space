// src/app/(owner)/dashboard/slot-config/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getFirstLibraryId, getSlotConfigs } from '@/lib/actions/owner'
import SlotConfigClient from '@/components/owner/SlotConfigClient'

export const dynamic = 'force-dynamic'

export default async function SlotConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ lib?: string }>
}) {
  const { lib } = await searchParams

  const libraryId = lib ?? await getFirstLibraryId()
  if (!libraryId) redirect('/onboarding/add-library')

  const supabase = await createServerSupabaseClient()
  const [slots, libRow] = await Promise.all([
    getSlotConfigs(libraryId),
    supabase.from('libraries').select('name').eq('id', libraryId).maybeSingle(),
  ])

  return (
    <SlotConfigClient
      key={libraryId}
      slots={slots}
      libraryId={libraryId}
      libraryName={libRow.data?.name ?? ''}
    />
  )
}