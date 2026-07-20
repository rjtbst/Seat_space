// src/lib/actions/shared/action-result.ts
/**
 * Canonical return type for every server action in the app.
 *
 * Previously this type was independently declared in 14 separate action
 * files (owner/admin/student/auth/payout actions), all with the exact same
 * shape (`{ success: true; data: T } | { success: false; error: string }`).
 * That meant a future shape change (e.g. adding an error `code` for i18n)
 * would have required editing 14 files with no compiler guarantee they'd
 * stay in sync. Consolidated to one source of truth — see architecture
 * audit, Phase 1 / Priority 1.3.
 */
export type ActionOk<T> = { success: true; data: T }
export type ActionErr = { success: false; error: string }
export type ActionResult<T = undefined> = ActionOk<T> | ActionErr
