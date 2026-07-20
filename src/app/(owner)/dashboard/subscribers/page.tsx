// src/app/(owner)/dashboard/subscribers/page.tsx
import { redirect } from 'next/navigation'
import { getFirstLibraryId } from '@/lib/actions/owner'
import { getLibrarySubscribers } from '@/lib/actions/owner/subscribers'
import SubscribersClient from '@/components/owner/SubscribersClient'

export const dynamic = 'force-dynamic'

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ lib?: string }>
}) {
  const { lib } = await searchParams
  const libraryId = lib ?? await getFirstLibraryId()
  if (!libraryId) redirect('/onboarding/add-library')

  const subscribers = await getLibrarySubscribers(libraryId)

  return <SubscribersClient libraryId={libraryId} subscribers={subscribers} />
}
