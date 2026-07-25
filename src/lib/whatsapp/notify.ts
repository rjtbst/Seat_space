// src/lib/whatsapp/notify.ts
//
// Single entry point for sending a WhatsApp notification tied to a user.
// Every call:
//   1. Looks up the user's verified WhatsApp number — skips silently
//      (logged, not thrown) if they don't have one. Never blocks the
//      caller's real transaction either way.
//   2. Writes a `notifications` row with channel='whatsapp',
//      status='pending' — the existing notifications table.
//   3. Calls the Meta Cloud API and updates that row to 'sent' or
//      'failed'.
//
// Called ALONGSIDE the existing in_app notify_user()/notifications
// insert at each trigger point, not instead of it.

import { sendWhatsappTemplate } from '@/lib/whatsapp/client'
import { WA_TEMPLATES, otpVerificationParams } from '@/lib/whatsapp/templates'
import { ENABLE_WHATSAPP } from '@/lib/feature-flags'

type NotifyArgs = {
  userId: string
  event: string
  title: string
  templateName: string
  templateParams: string[]
  libraryId?: string | null
  bookingId?: string | null
  subscriptionId?: string | null
}

/**
 * `supabase` is intentionally untyped, matching the `as any` pattern
 * already used elsewhere in this codebase for RPC/table calls not yet
 * covered by generated types — this is called with the cookie-based
 * server client, the service-role client, and from cron routes, which
 * don't share one exact TS type.
 */
export async function sendWhatsappNotification(
  supabase: any,
  args: NotifyArgs,
): Promise<void> {
  // Bypass active (see lib/feature-flags.ts): skip before touching the
  // DB or the Graph API at all. Every call site already treats this as
  // fire-and-forget, so callers (webhooks, cron, booking actions) don't
  // need their own ENABLE_WHATSAPP checks -- this one covers all of
  // them. Logged at a quiet level since this is expected, not an error.
  if (!ENABLE_WHATSAPP) {
    console.debug(`[whatsapp-notify] skipped ${args.event} for user ${args.userId}: WhatsApp disabled (ENABLE_WHATSAPP=false)`)
    return
  }

  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('whatsapp_number, whatsapp_verified_at')
      .eq('id', args.userId)
      .maybeSingle()

    const number = userRow?.whatsapp_number as string | null | undefined
    const verifiedAt = userRow?.whatsapp_verified_at as string | null | undefined

    if (!number || !verifiedAt) {
      console.warn(`[whatsapp-notify] skipped ${args.event} for user ${args.userId}: no verified WhatsApp number`)
      return
    }

    const { data: row, error: insertErr } = await supabase
      .from('notifications')
      .insert({
        user_id: args.userId,
        library_id: args.libraryId ?? null,
        booking_id: args.bookingId ?? null,
        subscription_id: args.subscriptionId ?? null,
        channel: 'whatsapp',
        event: args.event,
        status: 'pending',
        title: args.title,
        body: args.templateParams.join(' | '),
        payload: JSON.stringify({ templateName: args.templateName, params: args.templateParams }),
      })
      .select('id')
      .maybeSingle()

    if (insertErr) {
      console.warn(`[whatsapp-notify] notifications insert failed for ${args.event}:`, insertErr.message)
      return
    }

    const result = await sendWhatsappTemplate(number, args.templateName, args.templateParams)

    if (!row?.id) return

    if (result.ok) {
      await supabase.from('notifications').update({ status: 'sent' }).eq('id', row.id)
    } else {
      await supabase
        .from('notifications')
        .update({ status: 'failed', payload: JSON.stringify({ templateName: args.templateName, params: args.templateParams, error: result.error }) })
        .eq('id', row.id)
    }
  } catch (err) {
    console.warn(`[whatsapp-notify] unexpected failure for ${args.event}:`, err)
  }
}

/**
 * OTP delivery is a slightly different shape from the notify helper
 * above — it doesn't look up a verified number (there isn't one yet,
 * that's the whole point of the OTP), doesn't write a `notifications`
 * row (there's already a dedicated whatsapp_otp_codes table for this),
 * and the caller needs the raw send result to decide what to tell the
 * user. Kept here rather than in onboarding-whatsapp.ts directly so
 * there's exactly one file that imports the Graph API client.
 */
export async function sendOtpViaWhatsapp(
  toNumber: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  // Bypass active: the `whatsapp` onboarding step is skipped entirely
  // (see computeOnboardingStep in lib/auth/state.ts), so this shouldn't
  // normally be reached -- kept as a direct-call safety net all the
  // same. Behaves exactly like "Meta not configured yet" already did:
  // ok:false, and the caller (sendWhatsappOtp) falls back to logging
  // the code server-side rather than blocking the flow.
  if (!ENABLE_WHATSAPP) {
    return { ok: false, error: 'WhatsApp integration disabled (ENABLE_WHATSAPP=false)' }
  }
  const result = await sendWhatsappTemplate(toNumber, WA_TEMPLATES.OTP_VERIFICATION, otpVerificationParams(code))
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
