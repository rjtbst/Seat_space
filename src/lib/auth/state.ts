// src/lib/auth/state.ts
//
// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for "where is this user in the auth/onboarding
// lifecycle, and where should they be sent right now."
//
// Before this module existed, that question was answered independently
// (and inconsistently) in at least five places: the OAuth callback route,
// verifyOtp(), requireRole(), the staff layout, and the login page. Two of
// those checked nothing at all, one checked the wrong thing, and none of
// them agreed with each other -- which is exactly how a user could skip
// onboarding by clicking "Explore" and then get asked to pick a role again
// on their next login.
//
// Every one of those call sites now goes through the pure functions below
// instead of re-deriving the answer from a partial view of the user row.
// This file has NO side effects and NO I/O, on purpose -- it must be safe
// to import from the Edge middleware runtime as well as normal server
// code, and it must be trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────

import type { Enums } from '@/lib/supabase/types'

export type UserRole = Enums<'user_role'>

/**
 * The exact columns every caller needs to compute onboarding state.
 * Kept minimal on purpose: middleware selects this on every authenticated
 * request, so it has to stay a single cheap, indexed lookup.
 */
export type OnboardingRow = {
  role: UserRole
  role_selected_at: string | null
  full_name: string | null
  whatsapp_verified_at: string | null
  onboarded?: boolean | null
}

export type OnboardingStep =
  | 'role'      // hasn't explicitly picked a role yet
  | 'profile'   // role picked, basic profile not filled in
  | 'whatsapp'  // profile done, WhatsApp not verified
  | 'complete'  // every gate cleared -- the "Active User" state

/**
 * THE state machine. Nothing else in the codebase should reimplement
 * this decision tree -- if a new mandatory onboarding step is ever
 * added, it goes here and only here.
 *
 * Admins are hand-provisioned directly in the database (the
 * prevent_role_self_elevation trigger is the only way to grant that
 * role), never through self-serve onboarding, so they're always treated
 * as complete regardless of the other columns.
 */
export function computeOnboardingStep(row: OnboardingRow | null | undefined): OnboardingStep {
  if (!row) return 'role'
  if (row.role === 'admin') return 'complete'
  if (!row.role_selected_at) return 'role'
  if (!row.full_name || row.full_name.trim() === '') return 'profile'
  if (!row.whatsapp_verified_at) return 'whatsapp'
  return 'complete'
}

/** True once every onboarding gate has been cleared. This is the live
 *  equivalent of `users.onboarded` -- that column is a persisted mirror
 *  of this result (written by verifyWhatsappOtp()), kept around so
 *  simple boolean filters elsewhere (admin dashboards, analytics) don't
 *  need to reimplement this logic. */
export function isActive(row: OnboardingRow | null | undefined): boolean {
  return computeOnboardingStep(row) === 'complete'
}

/** Where a user with this role actually lives once fully onboarded. */
export function homeForRole(role: UserRole | null | undefined): string {
  if (role === 'admin') return '/admin'
  if (role === 'owner') return '/dashboard'
  if (role === 'staff') return '/staff'
  return '/explore'
}

/** The basic-profile step's page differs per role (student/owner share a
 *  page shape but not a route; staff has its own). Centralized here so
 *  it's never duplicated across redirects again. */
export function profilePathForRole(role: UserRole): string {
  if (role === 'owner') return '/onboarding/owner-profile'
  if (role === 'staff') return '/onboarding/staff-profile'
  return '/onboarding/profile'
}

/** The single page to send a user to for their current step. */
export function pathForStep(step: OnboardingStep, role: UserRole): string {
  if (step === 'role') return '/onboarding/role'
  if (step === 'profile') return profilePathForRole(role)
  if (step === 'whatsapp') return '/onboarding/whatsapp'
  return homeForRole(role)
}

/** Convenience wrapper: given the row, where should this user be sent? */
export function resolveDestination(row: OnboardingRow | null | undefined): string {
  const step = computeOnboardingStep(row)
  const role = row?.role ?? 'student'
  return pathForStep(step, role)
}

/**
 * Pages that stay reachable indefinitely once role matches, independent
 * of onboarding step -- reused post-onboarding flows (an owner adding a
 * second library, editing library photos, etc). Deliberately NOT part of
 * the step gate: these pages already guard themselves with `requireRole`
 * and don't need to be revisited in onboarding order.
 */
export const EVERGREEN_ROLE_PATHS: Record<UserRole, string[]> = {
  owner:   ['/onboarding/add-library', '/onboarding/go-live', '/onboarding/library-photos'],
  student: [],
  staff:   [],
  admin:   [],
}

export function isEvergreenRolePath(pathname: string, role: UserRole): boolean {
  return (EVERGREEN_ROLE_PATHS[role] ?? []).some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The mandatory onboarding-gate pages (as opposed to evergreen ones) --
 * used by middleware to decide whether a user who has already completed
 * onboarding is trying to re-visit a gate page (role selection, the
 * profile form, WhatsApp verification) and should be bounced to their
 * real home instead of allowed to loop back through onboarding.
 */
export function isMandatoryOnboardingGatePath(pathname: string, role: UserRole): boolean {
  const gates = ['/onboarding/role', profilePathForRole(role), '/onboarding/whatsapp']
  return gates.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export function matchesPathOrChild(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`)
}

/**
 * Roles a person can pick for themselves before ever having an account --
 * i.e. from a landing-page "I'm a student" / "I run a library" choice,
 * carried through signup as a `?role=` query param. Deliberately excludes
 * 'staff' (invited by an owner, never self-selected) and 'admin'
 * (hand-provisioned) -- widening this to accept arbitrary role strings
 * from a URL would let anyone request an admin/staff account by editing
 * the query string.
 */
export type SelfServeRole = 'student' | 'owner'
const SELF_SERVE_ROLES: readonly SelfServeRole[] = ['student', 'owner']

/** Validates a raw (possibly attacker-controlled) query-param value against
 *  the roles someone is actually allowed to pre-select for themselves.
 *  Returns null for anything else, including 'staff'/'admin'/garbage. */
export function parsePreselectedRole(value: string | null | undefined): SelfServeRole | null {
  return SELF_SERVE_ROLES.includes(value as SelfServeRole) ? (value as SelfServeRole) : null
}
