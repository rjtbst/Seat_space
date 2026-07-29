// src/components/chat/mobileTabBarOffset.ts
//
// The chat widget floats above a mobile bottom tab bar that only exists on
// SOME pages — student (58px, see MobileTabBar.tsx) and owner (58px, see
// OwnerMobileTabBar.tsx) both have one; staff pages and every guest/public
// page (including the marketing homepage) do not. The widget used to
// hardcode one offset for every page regardless, which meant it either sat
// on top of a tab bar it didn't know about, or floated in an empty gap on
// pages that never had one.
//
// Route prefixes here are taken directly from the ones already documented
// in lib/chat/prompt/systemPrompt.ts (STUDENT_SECTION / OWNER_SECTION) —
// that's the existing source of truth for "what pages does each role have,"
// so this reuses it instead of maintaining a second, possibly-drifting list.

const STUDENT_TAB_BAR_PREFIXES = ['/explore', '/library', '/bookings', '/my-books', '/books', '/subscriptions', '/payments', '/profile']
const OWNER_TAB_BAR_PREFIXES = ['/dashboard']

export function hasBottomTabBar(pathname: string | null): boolean {
  if (!pathname) return false
  return [...STUDENT_TAB_BAR_PREFIXES, ...OWNER_TAB_BAR_PREFIXES].some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
}