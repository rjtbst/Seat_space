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
import { resolveDestination, parsePreselectedRole, type OnboardingRow } from '@/lib/auth/state'

function safeNext(next: string, origin: string): string {
  if (!next.startsWith('/')) return origin
  return `${origin}${next}`
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const preselectedRole = parsePreselectedRole(searchParams.get('role'))
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

  // handle_new_user() has already created the users row by the time we
  // get here (it fires on auth.users insert, which just happened as part
  // of exchangeCodeForSession for a brand-new signup).
  const { data: row } = await supabase
    .from('users')
    .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')
    .eq('id', data.user.id)
    .maybeSingle()

  let onboardingRow = row as OnboardingRow | null

  // A role chosen on the landing page (Google signup) or at signup time
  // (email confirmation link) arrives here as `?role=`. Only ever applied
  // to an account that hasn't picked one yet -- an existing user signing
  // back in with a stray `?role=` in the URL (e.g. a stale/shared link)
  // must never have their real role silently overwritten.
  if (preselectedRole && !onboardingRow?.role_selected_at) {
    const nowIso = new Date().toISOString()
    const { data: updatedRows, error: roleWriteError } = await supabase
      .from('users')
      .update({ role: preselectedRole, role_selected_at: nowIso })
      .eq('id', data.user.id)
      .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')

    if (!roleWriteError && updatedRows && updatedRows.length > 0) {
      onboardingRow = updatedRows[0] as OnboardingRow
    } else if (!onboardingRow) {
      // Safety net: handle_new_user() row somehow doesn't exist yet.
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email ?? null,
          phone: data.user.phone ?? null,
          role: preselectedRole,
          role_selected_at: nowIso,
        })
        .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')

      if (!insertError && inserted && inserted.length > 0) {
        onboardingRow = inserted[0] as OnboardingRow
      }
    }
    // If the write failed for some other reason, fall through and let the
    // normal onboarding-state computation below send them to
    // /onboarding/role as a safe fallback rather than blocking sign-in.
  }

  // Password recovery (and any other flow with an explicit, real
  // destination) is honoured as-is -- onboarding-state routing only
  // applies to the default sign-in flow, where no specific `next` was
  // requested.
  if (next && next !== '/onboarding/role') {
    return NextResponse.redirect(safeNext(next, origin))
  }

  const destination = resolveDestination(onboardingRow)
  return NextResponse.redirect(`${origin}${destination}`)
}
