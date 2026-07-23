// src/lib/whatsapp/client.ts
// Thin wrapper around Meta's WhatsApp Cloud API (Graph API). Direct
// Cloud API calls, not a BSP (Interakt/AiSensy/Gupshup) — cheapest
// option at this scale, and this is a plain REST call, so there's
// nothing a BSP's dashboard gives us that's worth the extra monthly fee.
//
// Env vars required:
//   WHATSAPP_PHONE_NUMBER_ID   -- from Meta app's WhatsApp > API Setup
//   WHATSAPP_ACCESS_TOKEN      -- permanent System User token, NOT the
//                                 24h temporary token from the quickstart
//   WHATSAPP_GRAPH_API_VERSION -- optional, defaults to v21.0
//
// Templates referenced below must already exist and be APPROVED in Meta
// Business Manager (WhatsApp Manager > Message Templates) before this
// will successfully send anything.

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v21.0'

export type WhatsappSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }

/**
 * Sends an approved WhatsApp template message with body-text placeholders
 * filled in order ({{1}}, {{2}}, ...). No header/media support — none of
 * the current notifications need it.
 */
export async function sendWhatsappTemplate(
  to: string, // E.164, e.g. +919876543210
  templateName: string,
  bodyParams: string[],
  languageCode = 'en',
): Promise<WhatsappSendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.error('[whatsapp] WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set')
    return { ok: false, error: 'WhatsApp not configured' }
  }

  const toDigitsOnly = to.replace(/^\+/, '')

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toDigitsOnly,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: bodyParams.length
              ? [{ type: 'body', parameters: bodyParams.map(text => ({ type: 'text', text })) }]
              : [],
          },
        }),
      },
    )

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      const errMsg = json?.error?.message ?? `HTTP ${res.status}`
      console.error(`[whatsapp] send failed (${templateName} -> ${to}):`, errMsg)
      return { ok: false, error: errMsg }
    }

    const messageId = json?.messages?.[0]?.id ?? 'unknown'
    return { ok: true, messageId }
  } catch (err) {
    console.error(`[whatsapp] send threw (${templateName} -> ${to}):`, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
