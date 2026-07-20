//onboarding/staff-profile/page.tsx
import { requireRole } from '@/lib/auth/guards'
import StaffProfileClient from '@/components/staff/StaffProfileClient'

export default async function StaffProfilePage() {
  await requireRole('staff')
  return <StaffProfileClient />
}