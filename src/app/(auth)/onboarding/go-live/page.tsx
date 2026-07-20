// src/app/(auth)/onboarding/go-live/page.tsx
import { requireRole } from '@/lib/auth/guards'
import GoLiveClient from '@/components/owner/GoLiveClient'

export default async function GoLivePage() {
  await requireRole('owner')
  return <GoLiveClient />
}