// src/lib/feature-flags.ts
//
// Temporary feature flags for functionality gated on an external
// dependency that isn't available yet. Read once as a module-level
// constant (same pattern as the tokens in lib/config.ts) so every
// consumer -- Edge middleware, server actions, RSCs, and (where noted)
// client components -- sees the same value without re-parsing env on
// every call.
//
// ── ENABLE_WHATSAPP ─────────────────────────────────────────────────
// Meta's WhatsApp Cloud API requires business verification and a
// linked payment card before it will send anything. Until that's
// done:
//   - onboarding never waits on WhatsApp OTP (see the `whatsapp` step
//     in lib/auth/state.ts's computeOnboardingStep -- skipped entirely
//     while this flag is off)
//   - lib/whatsapp/notify.ts short-circuits before touching the DB or
//     the Graph API, so no outbound WhatsApp call is ever attempted
//   - lib/whatsapp/client.ts also checks this flag directly, as a
//     second line of defence for any future call site that imports it
//     without going through notify.ts
//
// None of the underlying WhatsApp code is removed. Set
// ENABLE_WHATSAPP=true (both here and, for the client-visible copy in
// OwnerProfileClient, NEXT_PUBLIC_ENABLE_WHATSAPP=true) once Meta
// verification + billing are sorted -- no code changes required.
export const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP === 'true'

// Client components can't read plain server env vars at runtime -- Next
// only inlines NEXT_PUBLIC_-prefixed vars into the browser bundle. This
// is used purely for onboarding-step copy/labels (e.g. "Step 2 of 2" vs
// "Step 2 of 3"); it carries no security weight, since the actual gate
// (middleware + lib/auth/state.ts) is enforced server-side off
// ENABLE_WHATSAPP above regardless of what this says. Keep the two in
// sync when flipping the flag.
export const ENABLE_WHATSAPP_CLIENT = process.env.NEXT_PUBLIC_ENABLE_WHATSAPP === 'true'
