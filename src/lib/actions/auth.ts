// src/lib/actions/auth.ts
'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Enums, TablesUpdate } from '@/lib/supabase/types'
import { z } from 'zod'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import {
  computeOnboardingStep,
  pathForStep,
  type OnboardingRow,
} from '@/lib/auth/state'

// ─── Types ────────────────────────────────────────────────────────────────────
type UserRole = Enums<'user_role'>

import type { ActionResult, ActionOk, ActionErr } from '@/lib/actions/shared/action-result'
export type { ActionResult, ActionOk, ActionErr }

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const emailSchema = z.string().email('Enter a valid email address').trim().toLowerCase()
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')

const profileSchema = z.object({
  full_name: z.string().min(1).max(120).trim(),
  city:      z.string().max(80).trim().optional().default(''),
  state:     z.string().max(80).trim().optional().default(''),
  phone:     z.string().optional(),
  email:     z.string().email().optional(),
})

export type ProfileFormData = z.infer<typeof profileSchema>

const roleSchema = z.enum(['student', 'owner', 'staff'])

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
export async function signInWithGoogle(
  redirectAfter?: string
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createServerSupabaseClient()

  // No hardcoded '/onboarding/role' default anymore -- when redirectAfter
  // isn't given, the callback route computes the right destination from
  // the user's actual onboarding state instead of assuming "role
  // selection". Hardcoding that default was half of why a returning user
  // with an already-selected role kept getting sent back to pick one
  // again.
  const callbackUrl = redirectAfter
    ? `${siteUrl()}/api/auth/callback?next=${encodeURIComponent(redirectAfter)}`
    : `${siteUrl()}/api/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl },
  })

  if (error || !data.url) {
    return { success: false, error: error?.message ?? 'Google login failed' }
  }

  return { success: true, data: { url: data.url } }
}

// ─── Email & password: sign up ────────────────────────────────────────────────
export async function signUpWithEmail(
  rawEmail: string,
  rawPassword: string
): Promise<ActionResult<{ needsEmailConfirmation: boolean }>> {
  const emailParsed = emailSchema.safeParse(rawEmail)
  if (!emailParsed.success) {
    return { success: false, error: emailParsed.error.errors[0].message }
  }
  const pwParsed = passwordSchema.safeParse(rawPassword)
  if (!pwParsed.success) {
    return { success: false, error: pwParsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()

  const ip = await getClientIp()
  const ipLimit = await checkRateLimit(supabase, `email_signup:ip:${ip}`, RATE_LIMITS.OTP_PER_IP)
  if (!ipLimit.allowed) {
    return { success: false, error: 'message' in ipLimit ? ipLimit.message : 'Rate limit exceeded' }
  }

  const { data, error } = await supabase.auth.signUp({
    email: emailParsed.data,
    password: pwParsed.data,
    options: { emailRedirectTo: `${siteUrl()}/api/auth/callback` },
  })

  if (error) {
    // Supabase returns a generic-looking error for "email already
    // registered" in some configs and a specific one in others -- we
    // don't special-case it into a distinct message on purpose, since
    // doing so would let an attacker enumerate registered emails.
    return { success: false, error: error.message }
  }

  // `data.session` is null when email confirmation is required (the
  // expected path) -- that's success, not a failure state.
  return { success: true, data: { needsEmailConfirmation: !data.session } }
}

// ─── Email & password: sign in ────────────────────────────────────────────────
export async function signInWithEmail(
  rawEmail: string,
  password: string
): Promise<ActionResult<{ redirectTo: string }>> {
  const emailParsed = emailSchema.safeParse(rawEmail)
  if (!emailParsed.success) {
    return { success: false, error: emailParsed.error.errors[0].message }
  }
  if (!password) {
    return { success: false, error: 'Enter your password' }
  }

  const supabase = await createServerSupabaseClient()

  // Two limits: per-IP (stop credential-stuffing sweeps across many
  // accounts) and per-account (stop targeted brute-forcing of one
  // person's password) -- same pattern as the WhatsApp/phone OTP limits
  // below, applied to password auth instead.
  const ip = await getClientIp()
  const ipLimit = await checkRateLimit(supabase, `email_signin:ip:${ip}`, RATE_LIMITS.OTP_PER_IP)
  if (!ipLimit.allowed) {
    return { success: false, error: 'message' in ipLimit ? ipLimit.message : 'Rate limit exceeded' }
  }
  const acctLimit = await checkRateLimit(
    supabase, `email_signin:acct:${emailParsed.data}`,
    { windowSeconds: 900, max: 10, message: 'Too many attempts on this account. Please wait 15 minutes and try again.' },
  )
  if (!acctLimit.allowed) {
    return { success: false, error: 'message' in acctLimit ? acctLimit.message : 'Rate limit exceeded' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailParsed.data,
    password,
  })

  if (error || !data.user) {
    return { success: false, error: 'Incorrect email or password.' }
  }

  const { data: row } = await supabase
    .from('users')
    .select('role, role_selected_at, full_name, whatsapp_verified_at, onboarded')
    .eq('id', data.user.id)
    .maybeSingle()

  const step = computeOnboardingStep(row as OnboardingRow | null)
  return { success: true, data: { redirectTo: pathForStep(step, row?.role ?? 'student') } }
}

// ─── Email & password: forgot / reset ─────────────────────────────────────────
export async function requestPasswordReset(rawEmail: string): Promise<ActionResult> {
  const emailParsed = emailSchema.safeParse(rawEmail)
  if (!emailParsed.success) {
    return { success: false, error: emailParsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()

  const ip = await getClientIp()
  const ipLimit = await checkRateLimit(supabase, `pw_reset:ip:${ip}`, RATE_LIMITS.OTP_PER_IP)
  if (!ipLimit.allowed) {
    return { success: false, error: 'message' in ipLimit ? ipLimit.message : 'Rate limit exceeded' }
  }
  const acctLimit = await checkRateLimit(supabase, `pw_reset:acct:${emailParsed.data}`, RATE_LIMITS.OTP_PER_PHONE)
  if (!acctLimit.allowed) {
    return { success: false, error: 'message' in acctLimit ? acctLimit.message : 'Rate limit exceeded' }
  }

  // Always return success regardless of whether the email is registered
  // -- a differing response would let anyone enumerate registered
  // accounts by trying "forgot password" against arbitrary addresses.
  await supabase.auth.resetPasswordForEmail(emailParsed.data, {
    redirectTo: `${siteUrl()}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  })

  return { success: true, data: undefined }
}

export async function updatePassword(newPassword: string): Promise<ActionResult> {
  const pwParsed = passwordSchema.safeParse(newPassword)
  if (!pwParsed.success) {
    return { success: false, error: pwParsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'This reset link has expired. Please request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password: pwParsed.data })
  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: undefined }
}

// ─── Set Role ─────────────────────────────────────────────────────────────────
export async function setRole(
  role: UserRole
): Promise<ActionResult<{ redirectTo: string }>> {
  const roleResult = roleSchema.safeParse(role)
  if (!roleResult.success) {
    return { success: false, error: 'Invalid role' }
  }

  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return { success: false, error: 'Session expired. Please sign in again.' }
  }

  // A role is picked exactly once. Middleware already stops a user from
  // navigating back to /onboarding/role once role_selected_at is set, but
  // this action is a second, independent check against direct calls
  // (e.g. a replayed request) -- "prevent users from changing roles
  // accidentally" applies at the action level too, not only the page.
  const { data: existing } = await supabase
    .from('users')
    .select('role_selected_at')
    .eq('id', user.id)
    .maybeSingle()

  if (existing?.role_selected_at) {
    return { success: false, error: 'A role has already been selected for this account.' }
  }

  const nowIso = new Date().toISOString()

  const { error, data: rows } = await supabase
    .from('users')
    .update({ role: roleResult.data, role_selected_at: nowIso })
    .eq('id', user.id)
    .select('id')

  if (error) {
    console.error('setRole DB error:', error)
    return { success: false, error: 'Could not save role. Please try again.' }
  }

  if (!rows || rows.length === 0) {
    // Safety net: handle_new_user() should always have created this row
    // already, but if it somehow hasn't, don't leave the user stuck.
    const { error: insertError } = await supabase.from('users').insert({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: roleResult.data,
      role_selected_at: nowIso,
    })

    if (insertError) {
      console.error('setRole insert fallback error:', insertError)
      return { success: false, error: 'Could not save role. Please try again.' }
    }
  }

  return { success: true, data: { redirectTo: pathForStep('profile', roleResult.data) } }
}

// ─── Update Profile ───────────────────────────────────────────────────────────
export async function updateProfile(
  formData: ProfileFormData
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = profileSchema.safeParse(formData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Deliberately does NOT set onboarded: true here. Completing the basic
  // profile is one gate among several (role -> profile -> WhatsApp) --
  // setting the final flag this early was the other half of the original
  // bug: it let an account through to its dashboard/explore page before
  // WhatsApp verification (and previously, before it existed at all)
  // ever ran. onboarded is only ever set by verifyWhatsappOtp(), the
  // last gate in the chain.
  const payload: TablesUpdate<'users'> = {
    full_name: parsed.data.full_name,
    ...(parsed.data.city  ? { city: parsed.data.city }   : {}),
    ...(parsed.data.state ? { state: parsed.data.state } : {}),
    ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
  }

  const { error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  // Update email in auth if provided (email is on auth.users, not public.users)
  if (parsed.data.email) {
    await supabase.auth.updateUser({ email: parsed.data.email })
  }

  return {
    success: true,
    data: { redirectTo: '/onboarding/whatsapp' },
  }
}

// ─── Get Profile ──────────────────────────────────────────────────────────────
export async function getProfile() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return data
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────
export async function signOut() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/')
}
