'use client'
// src/components/shared/PageTransition.tsx
//
// WHY THIS EXISTS
// ----------------
// Next.js App Router already gives instant *navigation* (server render +
// streaming), but by default the new page just pops in with zero motion —
// which reads as a website, not an app. Native apps (and Linear/Airbnb-style
// web apps) give every screen a tiny, consistent entrance so the eye can
// follow what just happened.
//
// IMPORTANT — this is rendered from inside the persistent shell
// (StudentShell.tsx / owner+staff layout.tsx), directly wrapping
// `{children}`, NOT from a route-group `template.tsx`. That was the first
// version of this, and it was wrong: `template.tsx` remounts on *every*
// navigation to a shared route, including query-string-only navigations —
// e.g. ExploreClient's filter chips call router.push('/explore?city=...')
// to update results without a real page change. A template.tsx wrapper
// would remount that whole subtree on every filter tap, wiping its local
// state (view mode, open filter panel, scroll position) and replaying the
// enter animation on every keystroke. Embedding PageTransition directly in
// the shell and keying it on `usePathname()` (which excludes search
// params) means it only replays on an actual page change, and stays
// perfectly still through filter/search-param updates on the same page.
//
// Respects prefers-reduced-motion via Framer Motion's useReducedMotion,
// which is the JS-side counterpart to the CSS media query already handled
// globally in globals.css for plain CSS transitions.

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { usePathname } from 'next/navigation'

const variants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter:   { opacity: 1, y: 0 },
}

const reducedVariants: Variants = {
  initial: { opacity: 1, y: 0 },
  enter:   { opacity: 1, y: 0 },
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      // key={pathname} forces remount per route so the enter animation
      // replays every navigation (template.tsx already remounts this tree,
      // but keying on pathname also covers dynamic segments like
      // /library/[id] switching between two ids without a segment change).
      key={pathname}
      initial="initial"
      animate="enter"
      variants={reduceMotion ? reducedVariants : variants}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      // min-height keeps short pages from causing a layout jump against
      // the persistent shell while the transition plays.
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  )
}
