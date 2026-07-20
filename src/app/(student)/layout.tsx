// app/(student)/layout.tsx
import StudentShell from '@/components/student/StudentShell'
import { requireActiveRole } from '@/lib/auth/guards'

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // requireActiveRole (not requireRole): this is a terminal destination,
  // so it must also confirm onboarding (profile + WhatsApp) is finished --
  // otherwise a student who never finished onboarding could reach
  // /explore just by typing the URL. See AUTH_ONBOARDING_AUDIT.md.
  const { profile } = await requireActiveRole('student')
  return (
    <StudentShell displayName={profile.full_name ?? null}>
      {children}
    </StudentShell>
  )
}