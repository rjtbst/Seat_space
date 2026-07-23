// src/lib/actions/onboarding-whatsapp.ts
// The final onboarding gate for every role: a verified WhatsApp number.
// Required during onboarding, never as a login method -- see
// AUTH_ONBOARDING_AUDIT.md for why this is a separate table/flow from
// Supabase Auth's own OTP.
'use server'

import { createHash, randomInt } from 'crypto'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { homeForRole } from '@/lib/auth/state'
import { sendOtpViaWhatsapp } from '@/lib/whatsapp/notify'
import type { ActionResult } from '@/lib/actions/shared/action-result'

const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter your WhatsApp number in international format, e.g. +919876543210')

const otpSchema = z
  .string()
  .length(6, 'OTP must be exactly 6 digits')
  .regex(/^\d{6}$/, 'OTP must be digits only')

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

// ─── Send OTP ─────────────────────────────────────────────────────────────────
export async function sendWhatsappOtp(rawNumber: string): Promise<ActionResult> {
  const parsed = e164Schema.safeParse(rawNumber)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Session expired. Please sign in again.' }
  }

  // Friendly pre-check. The unique index on users.whatsapp_number is the
  // real backstop (see verifyWhatsappOtp) -- this just avoids sending an
  // OTP for a number that's already going to be rejected at save time.
  const { data: taken } = await supabase
    .from('users')
    .select('id')
    .eq('whatsapp_number', parsed.data)
    .neq('id', user.id)
    .maybeSingle()

  if (taken) {
    return { success: false, error: 'This WhatsApp number is already linked to another account.' }
  }

  // Same two-limit pattern as the old phone-OTP login flow: per-number
  // (stop harassment of one number) and per-IP (stop one attacker
  // sweeping many numbers) -- OTP sends cost real money regardless of
  // which channel they go over.
  const numberLimit = await checkRateLimit(supabase, `wa_otp:number:${parsed.data}`, RATE_LIMITS.OTP_PER_PHONE)
  if (!numberLimit.allowed) {
    return { success: false, error: 'message' in numberLimit ? numberLimit.message : 'Rate limit exceeded' }
  }
  const ip = await getClientIp()
  const ipLimit = await checkRateLimit(supabase, `wa_otp:ip:${ip}`, RATE_LIMITS.OTP_PER_IP)
  if (!ipLimit.allowed) {
    return { success: false, error: 'message' in ipLimit ? ipLimit.message : 'Rate limit exceeded' }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Runs as a SECURITY DEFINER RPC (see migration) rather than a direct
  // insert -- there is no client-writable RLS policy on
  // whatsapp_otp_codes, so a browser session can request a code for
  // itself but can never fabricate or overwrite one directly.
  const { error } = await supabase.rpc('insert_whatsapp_otp', {
    p_whatsapp_number: parsed.data,
    p_code_hash: hashCode(code),
    p_expires_at: expiresAt,
  })

  if (error) {
    console.error('sendWhatsappOtp DB error:', error)
    return { success: false, error: 'Could not send code. Please try again.' }
  }

  // Real send via Meta Cloud API. If WHATSAPP_PHONE_NUMBER_ID /
  // WHATSAPP_ACCESS_TOKEN aren't set yet (e.g. still finishing Meta
  // Business setup), sendOtpViaWhatsapp() returns ok:false and we fall
  // back to logging the code server-side so onboarding stays testable
  // in the meantime — this never blocks signup on WhatsApp being
  // configured.
  const sendResult = await sendOtpViaWhatsapp(parsed.data, code)
  if (!sendResult.ok) {
    // Logged unconditionally (not just outside production) — visible in
    // Vercel's function logs, the only way to see the code while
    // WhatsApp credentials are still being finished/verified in Meta
    // Business Manager.
    console.warn(`[whatsapp-otp] send failed for ${parsed.data}: ${sendResult.error}. Code was: ${code}`)
  }

  return { success: true, data: undefined }
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────
export async function verifyWhatsappOtp(
  rawNumber: string,
  token: string
): Promise<ActionResult<{ redirectTo: string }>> {
  const numberParsed = e164Schema.safeParse(rawNumber)
  if (!numberParsed.success) {
    return { success: false, error: numberParsed.error.errors[0].message }
  }
  const otpParsed = otpSchema.safeParse(token)
  if (!otpParsed.success) {
    return { success: false, error: otpParsed.error.errors[0].message }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Session expired. Please sign in again.' }
  }

  // Bounds brute-forcing a 6-digit code (1,000,000 combinations) within
  // its 10-minute validity window, same reasoning as the old phone-OTP
  // verify limit.
  const verifyLimit = await checkRateLimit(
    supabase, `wa_otp:verify:${user.id}`,
    { windowSeconds: 600, max: 10, message: 'Too many incorrect attempts. Please request a new code.' },
  )
  if (!verifyLimit.allowed) {
    return { success: false, error: 'message' in verifyLimit ? verifyLimit.message : 'Rate limit exceeded' }
  }

  const { data: rows } = await supabase
    .from('whatsapp_otp_codes')
    .select('id, code_hash, expires_at, consumed_at, attempts')
    .eq('user_id', user.id)
    .eq('whatsapp_number', numberParsed.data)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = rows?.[0]
  if (!row || new Date(row.expires_at) < new Date()) {
    return { success: false, error: 'Code expired. Please request a new one.' }
  }

  if (row.code_hash !== hashCode(otpParsed.data)) {
    await supabase.rpc('mark_whatsapp_otp_attempt', { p_id: row.id, p_consumed: false })
    return { success: false, error: 'Incorrect code.' }
  }

  await supabase.rpc('mark_whatsapp_otp_attempt', { p_id: row.id, p_consumed: true })

  // This single write is the moment onboarding actually completes for
  // every role -- the ONLY place users.onboarded is ever set to true.
  // The unique index on whatsapp_number is the real defence against two
  // accounts racing on the same number; this update simply surfaces that
  // as a friendly error instead of a raw Postgres error code.
  const { data: profileRow, error: updateError } = await supabase
    .from('users')
    .update({
      whatsapp_number: numberParsed.data,
      whatsapp_verified_at: new Date().toISOString(),
      onboarded: true,
    })
    .eq('id', user.id)
    .select('role')
    .maybeSingle()

  if (updateError) {
    if (updateError.code === '23505') {
      return { success: false, error: 'This WhatsApp number is already linked to another account.' }
    }
    console.error('verifyWhatsappOtp DB error:', updateError)
    return { success: false, error: 'Could not save your WhatsApp number. Please try again.' }
  }

  return { success: true, data: { redirectTo: homeForRole(profileRow?.role) } }
}
