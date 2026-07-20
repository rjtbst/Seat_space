// lib/library-status.ts
// Deliberately NOT a 'use server' file — this exports a plain const object
// and a synchronous function, neither of which are allowed in a 'use
// server' module (Next.js requires every export from such a file to be an
// async function). Used by both library.ts (a server-action file, which
// imports and calls computeLibraryDisplayStatus() from inside its own
// async functions) and directly by client components like GoLiveClient.tsx
// (which need the plain LIBRARY_STATUS_LABELS object for rendering).

export type LibraryDisplayStatus =
  | 'draft'             // never submitted for review, no subscription attempt yet
  | 'payment_pending'   // subscription started but not yet active
  | 'pending_approval'  // subscription IS active, waiting on admin review
  | 'trial'             // live via the first-library 14-day free trial, no paid subscription yet
  | 'active'            // publicly live and bookable on a real paid subscription
  | 'expired'           // subscription has definitively lapsed (cancelled/expired, or past_due beyond its grace period)
  | 'suspended'         // admin has suspended this library — owner cannot self-reactivate

/**
 * Single source of truth for "what state is this library in", combining
 * approval_status + is_active + the platform_subscriptions row (+ trial
 * status). Used by both the owner-facing Go Live page and the admin
 * library list, so the two audiences never see conflicting labels for
 * the same library.
 *
 * Priority order matters — checked top to bottom, first match wins:
 *   1. suspended    — admin action always overrides everything else
 *   2. expired      — a library that WAS paying and stopped is a more
 *                      useful/urgent signal than lumping it in with
 *                      "draft" (which implies never having tried at all)
 *   3. trial        — live for free during the one-time first-library
 *                      trial window, checked BEFORE active/general so a
 *                      trial library is never mislabeled as a paying one
 *   4. active       — currently live and bookable on a real subscription
 *   5. pending_approval — paid, just waiting on admin review
 *   6. payment_pending  — started the subscription flow, not active yet
 *   7. draft        — untouched, no subscription attempt at all
 */
export function computeLibraryDisplayStatus(input: {
  approvalStatus: string
  isActive: boolean
  subscriptionStatus: string | null  // null = no subscription row exists yet
  subscriptionActive: boolean        // from the same subActive logic used in publishLibrary — now trial-inclusive
  isInTrial?: boolean                // true while libraries.trial_ends_at is still in the future
  hadTrial?: boolean                 // true if trial_ends_at is set at all (even if it's now in the past)
}): LibraryDisplayStatus {
  const { approvalStatus, isActive, subscriptionStatus, subscriptionActive, isInTrial, hadTrial } = input

  if (approvalStatus === 'suspended') return 'suspended'

  // A subscription that has definitively lapsed is a more useful signal
  // than "draft" — this library was paying (or on its free trial) and
  // stopped, not one that never started. Deliberately checked BEFORE
  // `active`/`trial`: a stale is_active flag from before the sweep fix
  // (or any edge case where it hasn't been flipped off yet) should still
  // surface as "expired", not "active".
  if (subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') return 'expired'
  if (hadTrial && !isInTrial && !subscriptionActive) return 'expired'

  if (isActive && isInTrial) return 'trial'

  if (isActive) return 'active'

  if (subscriptionActive && approvalStatus === 'pending') return 'pending_approval'

  if (subscriptionStatus != null) return 'payment_pending'

  return 'draft'
}

export const LIBRARY_STATUS_LABELS: Record<LibraryDisplayStatus, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Draft',             color: '#6B7689', bg: '#F0EDE8' },
  payment_pending:  { label: 'Payment Pending',   color: '#92400E', bg: '#FEF3E2' },
  pending_approval: { label: 'Pending Approval',  color: '#1D4ED8', bg: '#DBEAFE' },
  trial:            { label: 'Free Trial',        color: '#7C3AED', bg: '#EDE9FE' },
  active:           { label: 'Active',            color: '#0A5E3F', bg: '#D1FAE5' },
  expired:          { label: 'Expired',           color: '#9B1C1C', bg: '#FEE2E2' },
  suspended:        { label: 'Suspended',         color: '#7C2D12', bg: '#FFEDD5' },
}
