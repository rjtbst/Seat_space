// lib/booking/qr.ts
/**
 * Booking QR code generation.
 *
 * Each confirmed booking gets a QR code that encodes a URL containing the
 * booking's UUID (`bookings.id`) as the FINAL path segment. This matters:
 * the staff scanner (src/app/(staff)/staff/scanner/page.tsx,
 * resolveBookingId()) parses a scanned value with
 *   rawId.trim().split('/').pop()
 * to support both a bare UUID and a full URL — but that only works if the
 * UUID is the last "/"-separated segment. A URL with a query string like
 * "?bookingId=<uuid>" would NOT parse correctly (it would return
 * "scanner?bookingId=<uuid>" as one chunk). So the QR must encode the UUID
 * as a trailing path segment, e.g.:
 *
 *   https://yourapp.com/booking/<uuid>
 *
 * If that route doesn't exist yet, the QR still works for staff scanning
 * (the scanner only needs the trailing UUID) — visiting the URL directly
 * in a browser is a secondary nice-to-have, not required for check-in.
 *
 * Uses the `qrcode` npm package (MIT licensed, zero runtime deps,
 * battle-tested Reed-Solomon implementation) rather than a hand-rolled
 * encoder — QR error-correction and mask-pattern scoring are easy to get
 * subtly wrong, and this is a check-in-critical code path.
 *
 * Install once:
 *   npm install qrcode
 *   npm install -D @types/qrcode
 */
import QRCode from 'qrcode'

/**
 * Build the canonical URL a booking's QR code should encode. The booking
 * UUID is ALWAYS the final "/"-separated segment — required for the
 * scanner's split('/').pop() parsing to recover it correctly.
 */
export function bookingScanUrl(bookingId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || ''
  return `${base}/booking/${bookingId}`
}

/**
 * Render a booking's QR code as an inline SVG string (data URI free —
 * no extra network request, no canvas, works in SSR and client alike).
 * Returns the raw `<svg>...</svg>` markup; caller can drop it straight
 * into a React component via dangerouslySetInnerHTML, or wrap it.
 */
export async function bookingQRSvg(bookingId: string): Promise<string> {
  const url = bookingScanUrl(bookingId)
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark:  '#0D1117',
      light: '#FFFFFF',
    },
  })
}

/**
 * Render a booking's QR code as a data: URL (PNG), for contexts that need
 * an <img src="..."> rather than inline SVG (e.g. emailing a booking
 * confirmation, or a downloadable ticket image).
 */
export async function bookingQRDataUrl(bookingId: string): Promise<string> {
  const url = bookingScanUrl(bookingId)
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: {
      dark:  '#0D1117',
      light: '#FFFFFF',
    },
  })
}
