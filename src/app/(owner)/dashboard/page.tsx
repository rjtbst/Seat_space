// src/app/(owner)/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getFirstLibraryId, getDashboardStats, getMonthlyRevenue,
  getTodayBookings, getSlotHeatmap,
} from '@/lib/actions/owner'
import DashboardClient from '@/components/owner/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lib?: string }>
}) {
  const { lib } = await searchParams

  // cache() on getFirstLibraryId means this is free if layout already called it
  const libraryId = lib ?? await getFirstLibraryId()
  if (!libraryId) redirect('/onboarding/add-library')

  const [stats, revenue, bookings, heatmap, libRow] = await Promise.all([
    getDashboardStats(libraryId),
    getMonthlyRevenue(libraryId),
    getTodayBookings(libraryId),
    getSlotHeatmap(libraryId),
    createServerSupabaseClient().then(sb =>
      sb.from('libraries').select('name').eq('id', libraryId).maybeSingle()
    ),
  ])

  return (
    <DashboardClient
      libraryName={libRow.data?.name ?? 'Your Library'}
      libraryId={libraryId}
      stats={stats}
      revenue={revenue}
      bookings={bookings}
      heatmap={heatmap}
    />
  )
}