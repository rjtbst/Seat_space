// src/app/(owner)/dashboard/bookings/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getFirstLibraryId, getTodayBookings, getSlotConfigs } from '@/lib/actions/owner'
import BookingsClient from '@/components/owner/BookingsClient'

export const dynamic = 'force-dynamic'

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ lib?: string }>
}) {
  const { lib } = await searchParams

  const supabase = await createServerSupabaseClient()

  const libraryId = lib ?? await getFirstLibraryId()
  if (!libraryId) redirect('/onboarding/add-library')

  const [bookings, libRow, slots] = await Promise.all([
    getTodayBookings(libraryId),
    supabase.from('libraries').select('name').eq('id', libraryId).maybeSingle(),
    getSlotConfigs(libraryId),
  ])

  return (
    <BookingsClient
      key={libraryId}
      bookings={bookings}
      libraryName={libRow.data?.name ?? ''}
      libraryId={libraryId}
      slots={slots}
    />
  )
}