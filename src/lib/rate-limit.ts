// lib/rate-limit.ts
/**
 * Application-level rate limiting, backed by the atomic
 * rate_limit_increment() Postgres function (see migration
 * 20260627090000_webhook_idempotency_and_audit.sql).
 *
 * This is a fixed-window limiter stored in Postgres. It is intentionally
 * simple and requires no new infrastructure (no Redis) — appropriate for
 * the traffic levels a single well-indexed Postgres instance handles
 * comfortably. At meaningfully higher scale (see audit notes on scaling to
 * 1M+ users), swap the implementation here for a Redis-backed sliding
 * window (e.g. Upstash) WITHOUT changing any call site — every caller only
 * ever sees `checkRateLimit()`'s return shape.
 *
 * Usage:
 *   const rl = await checkRateLimit(supabase, `otp:phone:${phone}`, { windowSeconds: 3600, max: 5 })
 *   if (!rl.allowed) return { success: false, error: rl.message }
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type RateLimitConfig = {
  windowSeconds: number
  max: number
  /** Shown to the user when the limit is hit; falls back to a generic message. */
  message?: string
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; message: string; retryAfterSeconds: number }

export async function checkRateLimit(
  supabase: SupabaseClient<any>,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { data: count, error } = await supabase.rpc('rate_limit_increment', {
    p_key: key,
    p_window_seconds: config.windowSeconds,
  })

  if (error) {
    // Fail OPEN, not closed: a rate-limiter outage should not take down
    // the feature it's protecting. Log loudly so the gap is visible, but
    // let the request through — the alternative (failing closed) turns a
    // rate-limiter bug into a full outage of booking/auth/refunds, which
    // is a worse production incident than under-enforcing a limit briefly.
    console.error(`[rate-limit] rate_limit_increment failed for key "${key}":`, error.message)
    return { allowed: true, remaining: config.max }
  }

  const current = (count as number) ?? 0

  if (current > config.max) {
    return {
      allowed: false,
      remaining: 0,
      message: config.message ?? 'Too many requests. Please wait a moment and try again.',
      retryAfterSeconds: config.windowSeconds,
    }
  }

  return { allowed: true, remaining: Math.max(0, config.max - current) }
}

/**
 * Pre-defined limits for the highest-abuse-risk actions in this app.
 * Centralized here so the actual numbers are easy to find and tune in one
 * place rather than scattered as magic numbers across action files.
 */
export const RATE_LIMITS = {
  // OTP requests cost real money (SMS/WhatsApp) and are a harassment vector
  // if unlimited (anyone can spam OTPs to a stranger's phone number).
  OTP_PER_PHONE:        { windowSeconds: 3600, max: 5,  message: 'Too many OTP requests for this number. Please wait an hour and try again.' },
  OTP_PER_IP:           { windowSeconds: 3600, max: 20, message: 'Too many OTP requests from your network. Please wait an hour and try again.' },

  // Booking attempts — generous enough for legitimate rapid retry after a
  // seat-taken conflict, tight enough to stop a scripted seat-hold-flood
  // attack (repeatedly holding seats with no intent to pay, denying
  // availability to real students).
  BOOKING_INITIATE_PER_USER: { windowSeconds: 60, max: 10, message: 'Too many booking attempts. Please wait a moment.' },

  // Refund initiation — admin-only, but still worth bounding in case of a
  // compromised admin session or a buggy retry loop in the admin UI.
  REFUND_INITIATE_PER_ADMIN: { windowSeconds: 60, max: 20, message: 'Too many refund actions in a short time. Please wait a moment.' },

  // Generic per-user server-action ceiling for anything not covered above
  // — a deliberately loose backstop, not a tight per-feature limit.
  GENERIC_PER_USER:     { windowSeconds: 60, max: 60, message: 'You are doing that too quickly. Please slow down.' },

  // AI assistant messages — generous enough for a real back-and-forth
  // conversation, tight enough to bound provider API cost from a runaway
  // client or scripted abuse.
  CHAT_MESSAGE_PER_USER: { windowSeconds: 60, max: 20, message: 'Too many messages — please slow down a little.' },
  CHAT_MESSAGE_PER_IP:   { windowSeconds: 60, max: 12, message: 'Too many messages from your network. Please wait a moment.' },
} as const

/**
 * Best-effort client IP extraction from standard reverse-proxy headers.
 * Used as a rate-limit key component — NOT for security-critical identity
 * decisions, since these headers are client-influenceable in some setups.
 * Vercel and most reverse proxies set x-forwarded-for reliably; falls back
 * to a constant so a missing header degrades to "treat all such requests
 * as one bucket" rather than throwing.
 */
export async function getClientIp(): Promise<string> {
  const { headers } = await import('next/headers')
  const h = await headers()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}
