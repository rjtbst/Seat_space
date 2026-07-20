// src/app/(auth)/onboarding/whatsapp/page.tsx
// Mandatory for every role, reached after role + profile. Middleware
// already stops anyone from getting here out of order (or skipping it),
// but this page is also directly linkable, so it re-derives where the
// user actually is and bounces them if they've already cleared this gate
// or haven't reached it yet -- same defense-in-depth pattern as the other
// onboarding pages.
import { redirect } from 'next/navigation'
import { getSupabaseUser } from '@/lib/supabase/server'
import { computeOnboardingStep, pathForStep, type OnboardingRow } from '@/lib/auth/state'
import WhatsappVerifyClient from '@/components/auth/WhatsappVerifyClient'

export default async function WhatsappOnboardingPage() {
  const { supabase, user } = await getSupabaseUser()
  if (!user) redirect('/login')

  const { data: row } = await supabase
    .from('users')
    .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')
    .eq('id', user.id)
    .maybeSingle()

  const onboardingRow = row as OnboardingRow | null
  const step = computeOnboardingStep(onboardingRow)
  const role = onboardingRow?.role ?? 'student'

  if (step !== 'whatsapp') {
    redirect(pathForStep(step, role))
  }

  return <WhatsappVerifyClient />
}
