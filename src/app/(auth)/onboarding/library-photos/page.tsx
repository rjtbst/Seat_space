// app/(auth)/onboarding/library-photos/page.tsx
import { requireRole } from '@/lib/auth/guards'
import LibraryPhotosClient from '@/components/owner/LibraryPhotosClient'

export default async function LibraryPhotosPage() {
  await requireRole('owner')
  return <LibraryPhotosClient />
}