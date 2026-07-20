// src/app/(auth)/login/page.tsx
//
// This is a server component wrapper specifically so an authenticated
// session can be redirected away from /login on the server, before any
// client JS runs -- middleware already does this same check (see
// src/middleware.ts), but that's an edge-runtime, request-level check;
// this is the "Server" layer of the "Middleware, Server, Client" defense
// in depth the audit calls for, and it means the login form never even
// flashes on screen for a signed-in user on a slow client, cache hit, or
// any path that reaches this route without passing back through
// middleware's matcher.
import { redirect } from 'next/navigation'
import { getSupabaseUser } from '@/lib/supabase/server'
import { resolveDestination, type OnboardingRow } from '@/lib/auth/state'
import LoginClient from '@/components/auth/LoginClient'

export default async function LoginPage() {
  const { supabase, user } = await getSupabaseUser()

  if (user) {
    const { data: row } = await supabase
      .from('users')
      .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')
      .eq('id', user.id)
      .maybeSingle()

    redirect(resolveDestination(row as OnboardingRow | null))
  }

  return <LoginClient />
}
