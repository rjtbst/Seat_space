// src/app/(auth)/onboarding/profile/page.tsx
import { requireRole } from '@/lib/auth/guards'
import StudentProfileClient from '@/components/student/StudentProfileClient'

export default async function StudentProfilePage() {
  await requireRole('student')
  return <StudentProfileClient />
}