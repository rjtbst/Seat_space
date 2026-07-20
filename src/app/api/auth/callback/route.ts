// src/app/api/auth/callback/route.ts
//
// Single callback for all three flows that end in a Supabase auth code
// exchange: Google OAuth, email confirmation links, and password-recovery
// links. All three call exchangeCodeForSession(code); they differ only in
// what should happen right after.
//
// Root cause this rewrite fixes: the previous version had
// `!userRow?.onboarded ? redirect('/onboarding/role') : ...` -- a blanket
// "not onboarded yet -> pick a role" with no memory of whether a role had
// already been picked. Since `onboarded` doesn't flip to true until the
// LAST onboarding gate clears, every user who had already chosen a role
// but hadn't finished the rest of onboarding got sent back to role
// selection on every single login. That's the exact "next login, asked to
// choose a role again" bug. Now the destination is computed by the same
// state machine everything else uses (src/lib/auth/state.ts), which
// distinguishes "never picked a role" from "picked a role, still mid
// onboarding" and resumes at the correct step either way.
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computeOnboardingStep, resolveDestination, type OnboardingRow } from '@/lib/auth/state'

function safeNext(next: string, origin: string): string {
  if (!next.startsWith('/')) return origin
  return `${origin}${next}`
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const error = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth-error?error=${encodeURIComponent(errorDesc ?? error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth-error?error=missing_code`)
  }

  const supabase = await createServerSupabaseClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user) {
    return NextResponse.redirect(
      `${origin}/auth-error?error=${encodeURIComponent(exchangeError?.message ?? 'session_failed')}`
    )
  }

  // Password recovery (and any other flow with an explicit, real
  // destination) is honoured as-is -- onboarding-state routing only
  // applies to the default sign-in flow, where no specific `next` was
  // requested.
  if (next && next !== '/onboarding/role') {
    return NextResponse.redirect(safeNext(next, origin))
  }

  // handle_new_user() has already created the users row by the time we
  // get here (it fires on auth.users insert, which just happened as part
  // of exchangeCodeForSession for a brand-new signup).
  const { data: row } = await supabase
    .from('users')
    .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')
    .eq('id', data.user.id)
    .maybeSingle()

  const destination = resolveDestination(row as OnboardingRow | null)
  return NextResponse.redirect(`${origin}${destination}`)
}
