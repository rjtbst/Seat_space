// src/lib/actions/owner/index.ts
//
// Barrel re-export — owner.ts was split into 6 domain files (Phase 4 /
// Priority 2.1 of the architecture audit): dashboard, seats, slots, plans,
// library-settings, photos. This file exists purely so every existing
// `import { x } from '@/lib/actions/owner'` across the codebase keeps
// working unchanged — new code can import directly from the specific
// sub-file instead (e.g. '@/lib/actions/owner/seats') to make the diff
// scope obvious in code review, but nothing requires that.

export * from './dashboard'
export * from './seats'
export * from './slots'
export * from './plans'
export * from './library-settings'
export * from './photos'
