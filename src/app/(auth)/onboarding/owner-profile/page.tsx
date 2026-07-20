// src/app/(auth)/onboarding/owner-profile/page.tsx
import { requireRole } from '@/lib/auth/guards'
import OwnerProfileClient from '@/components/owner/OwnerProfileClient'

export default async function OwnerProfilePage() {
  await requireRole('owner')
  return <OwnerProfileClient />
}