// src/lib/auth/guards.ts
// Server-side role guards for layouts and role-specific onboarding pages.
//
// Two distinct guards, on purpose:
//   - requireRole():       auth + role match only. Use on pages that must
//                          stay reachable regardless of onboarding step --
//                          the onboarding step pages themselves (role,
//                          profile, whatsapp) and "evergreen" role actions
//                          (owner adding a second library, etc).
//   - requireActiveRole(): auth + role match + onboarding fully complete.
//                          Use on the actual destination layouts
//                          (student/owner/staff/admin dashboards) -- this
//                          is what used to be missing (student, owner) or
//                          implemented ad hoc and inconsistently (staff),
//                          which is exactly what let unfinished accounts
//                          reach /explore. See AUTH_ONBOARDING_AUDIT.md.

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { Enums } from '@/lib/supabase/types'
import {
  computeOnboardingStep,
  homeForRole,
  pathForStep,
  type OnboardingRow,
} from '@/lib/auth/state'

type UserRole = Enums<'user_role'>

export { homeForRole }

/**
 * Fetches the current user's profile row, deduped per-request with
 * React's cache(). A layout and a page (or multiple nested layouts) in the
 * same request tree often each need this -- without cache(), every one of
 * them re-runs the same `users` SELECT. This doesn't speed up navigation
 * from one request to the next (cache() resets per request, by design --
 * it must, otherwise a stale role could leak into a request after a role
 * change), but it removes duplicate round-trips within a single page load,
 * which is the part actually under our control here.
 */
export const getProfile = cache(async () => {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name, onboarded, role_selected_at, whatsapp_verified_at')
    .eq('id', user.id)
    .maybeSingle()

  return { supabase, user, profile }
})

/**
 * Guards a page/layout to a single role, WITHOUT requiring onboarding to
 * be complete.
 * - No session                -> /login
 * - Authenticated, wrong role -> their real home (homeForRole)
 *
 * Deliberately does NOT check onboarding completeness -- role-specific
 * routes like /onboarding/add-library, and the onboarding step pages
 * themselves, are reused post-onboarding (adding another library,
 * editing a profile field, etc) and must stay reachable once the role
 * matches. Middleware is what stops an *incomplete* account from reaching
 * pages outside onboarding in the first place; this guard is defense in
 * depth for role matching, not step matching.
 */
export async function requireRole(role: UserRole) {
  const { supabase, user, profile } = await getProfile()
  if (!user) redirect('/login')
  if (!profile) redirect('/login')
  if (profile.role !== role) redirect(homeForRole(profile.role))

  return { supabase, user, profile }
}

/**
 * Guards a page/layout to a single role AND requires onboarding to be
 * fully complete. Use this on the actual destination layouts: student
 * shell, owner dashboard, staff app, admin console.
 * - No session                       -> /login
 * - Authenticated, wrong role        -> their real home
 * - Authenticated, onboarding incomplete -> the exact step they're on
 *   (never a blanket "/onboarding/role" -- that would re-ask for a role
 *   that may already be selected, which is the bug this guard exists to
 *   prevent).
 */
export async function requireActiveRole(role: UserRole) {
  const { supabase, user, profile } = await getProfile()
  if (!user) redirect('/login')
  if (!profile) redirect('/login')
  if (profile.role !== role) redirect(homeForRole(profile.role))

  const step = computeOnboardingStep(profile as OnboardingRow)
  if (step !== 'complete') {
    redirect(pathForStep(step, profile.role))
  }

  return { supabase, user, profile }
}

/**
 * Server-action variant of requireRole -- for use inside 'use server'
 * actions, where you can't navigate away, only return an error to the
 * caller.
 *
 *   const gate = await requireActionRole('owner')
 *   if (!gate.ok) return gate.error
 *   const { supabase, user } = gate
 */
export async function requireActionRole(role: UserRole) {
  const { supabase, user, profile } = await getProfile()
  if (!user) {
    return { ok: false as const, error: { success: false as const, error: 'Not authenticated' as string } }
  }

  if (!profile || profile.role !== role) {
    return { ok: false as const, error: { success: false as const, error: 'Not authorized' as string } }
  }

  return { ok: true as const, supabase, user, profile }
}

/**
 * Server-action variant of requireActiveRole -- same idea, but also
 * requires onboarding to be complete. Use for actions that assume a
 * fully-onboarded account (e.g. anything money-moving).
 */
export async function requireActiveActionRole(role: UserRole) {
  const { supabase, user, profile } = await getProfile()
  if (!user) {
    return { ok: false as const, error: { success: false as const, error: 'Not authenticated' as string } }
  }
  if (!profile || profile.role !== role) {
    return { ok: false as const, error: { success: false as const, error: 'Not authorized' as string } }
  }
  if (computeOnboardingStep(profile as OnboardingRow) !== 'complete') {
    return { ok: false as const, error: { success: false as const, error: 'Please finish onboarding first' as string } }
  }

  return { ok: true as const, supabase, user, profile }
}
