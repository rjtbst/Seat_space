// src/middleware.ts
// Runs on EVERY request. Refreshes the Supabase session and is the
// PRIMARY enforcement point for the auth/onboarding state machine
// (see src/lib/auth/state.ts for the state machine itself).
//
// What changed from the previous version, and why:
//   - Previously this file only checked "is there a session at all". It
//     never looked at onboarding progress, which is exactly how a user
//     could type /explore into the address bar mid-onboarding and get in
//     anyway -- role-based layout guards (requireRole) didn't check
//     onboarding completeness either, by design, because they're reused
//     by the onboarding step pages themselves. Nothing in the stack
//     actually enforced "onboarding must be finished before you reach a
//     destination route". Now this file does, for every request, before
//     any page component runs.
//   - Previously an authenticated user hitting /login just fell through
//     to the client-rendered login page (the comment literally said "we
//     can't check the role here"). Now it's resolved centrally and the
//     login page is simply never shown to an authenticated user.
//
// Role-vs-route matrix enforcement (a student can't open /dashboard, an
// owner can't open /staff, etc) stays at the layout level via
// requireRole/requireActiveRole -- those already run on the server for
// every request that reaches a layout, so that requirement is already
// satisfied there without a second DB round-trip per request here. This
// file's job is specifically: never let an incomplete account skip
// ahead, and never show auth-only pages to an authenticated session.

import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import {
  computeOnboardingStep,
  homeForRole,
  pathForStep,
  isEvergreenRolePath,
  isMandatoryOnboardingGatePath,
  matchesPathOrChild,
  type OnboardingRow,
} from '@/lib/auth/state'

// Infrastructure routes -- no user cookies, skip session refresh entirely
const INFRA_PREFIXES = [
  '/api/cron',
  '/api/payment/razorpay-webhook',
  '/api/payment/subscription-webhook',
  '/api/payment/payout-webhook',
  '/api/auth/callback', // handles its own auth exchange + redirect logic
]

// Destination routes that require a FULLY ONBOARDED session (not just a
// logged-in one). These are the real URL prefixes that appear in
// requests, not the (owner)/(student) route-group folder names.
const ACTIVE_ONLY_PREFIXES = [
  '/admin',         // platform admin
  '/dashboard',     // owner
  '/staff',         // staff
  '/explore',       // student
  '/library',       // student -- library detail + booking flow
  '/bookings',      // student
  '/books',         // student
  '/my-books',      // student
  '/payments',      // student
  '/profile',       // student
  '/subscriptions', // student
]

// Routes that require SOME session (auth or in-progress onboarding), but
// not necessarily a complete one.
const ONBOARDING_PREFIX = '/onboarding'

// Routes accessible only when NOT authenticated
const AUTH_ONLY_ROUTES = ['/login']

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(p => matchesPathOrChild(pathname, p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 0. Infra routes -- no cookies to refresh, skip straight through
  if (matchesPrefix(pathname, INFRA_PREFIXES)) {
    return NextResponse.next()
  }

  // 1. Refresh Supabase session + get current user
  const { supabase, user, response } = await updateSession(request)

  const isActiveOnlyRoute = matchesPrefix(pathname, ACTIVE_ONLY_PREFIXES)
  const isOnboardingRoute = matchesPathOrChild(pathname, ONBOARDING_PREFIX)
  const isAuthOnlyRoute   = matchesPrefix(pathname, AUTH_ONLY_ROUTES)

  // 2. Unauthenticated user hitting anything that needs a session
  if (!user) {
    if (isActiveOnlyRoute || isOnboardingRoute) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  // From here on, `user` is authenticated. Everything below decides
  // where an authenticated session is actually allowed to be -- this is
  // the part that didn't exist before.
  const { data: row } = await supabase
    .from('users')
    .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')
    .eq('id', user.id)
    .maybeSingle()

  const onboardingRow = row as OnboardingRow | null
  const role = onboardingRow?.role ?? 'student'
  const step = computeOnboardingStep(onboardingRow)

  // 3. An authenticated session must never see login/signup/forgot-password
  //    -- resolve centrally instead of leaving it to client-side checks.
  if (isAuthOnlyRoute) {
    const redirectParam = request.nextUrl.searchParams.get('redirect')
    const destination = redirectParam && redirectParam.startsWith('/')
      ? redirectParam
      : pathForStep(step, role)
    return NextResponse.redirect(new URL(destination, request.url))
  }

  // 4. Onboarding incomplete
  if (step !== 'complete') {
    if (isOnboardingRoute) {
      const onCorrectGate = matchesPathOrChild(pathname, pathForStep(step, role))
      const onEvergreenPath = isEvergreenRolePath(pathname, role)
      // /onboarding/role itself is only reachable while step === 'role';
      // pathForStep already reflects that, so onCorrectGate covers it.
      if (onCorrectGate || onEvergreenPath) {
        return response
      }
      // Wrong onboarding page for the current step (e.g. navigating
      // straight to /onboarding/whatsapp before finishing the profile
      // step) -- send back to the step they're actually on. Never lose
      // progress, never restart from role selection.
      return NextResponse.redirect(new URL(pathForStep(step, role), request.url))
    }

    if (isActiveOnlyRoute) {
      // This is the exact bug: clicking straight to a destination route
      // (e.g. /explore) without finishing onboarding. Resume from the
      // exact incomplete step -- never a blanket restart.
      return NextResponse.redirect(new URL(pathForStep(step, role), request.url))
    }

    // Public marketing/legal pages etc. stay reachable mid-onboarding.
    return response
  }

  // 5. Onboarding complete -- stop a finished account from looping back
  //    through the mandatory gate pages (role/profile/whatsapp). Evergreen
  //    role pages (add another library, etc) remain reachable.
  if (isOnboardingRoute && isMandatoryOnboardingGatePath(pathname, role) && !isEvergreenRolePath(pathname, role)) {
    return NextResponse.redirect(new URL(homeForRole(role), request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, site.webmanifest, robots.txt, sitemap.xml
     * - public files (og-image, logo, etc.)
     */
    '/((?!_next/static|_next/image|favicon|site.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf)).*)',
  ],
}
