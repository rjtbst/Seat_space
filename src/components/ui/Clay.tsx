// components/ui/clay.tsx
'use client'

/**
 * Claymorphic UI primitives.
 *
 * WHY THIS FILE EXISTS: the codebase has no shared Button/Card/Input kit —
 * every page hand-rolls its own Tailwind classes (see LibraryCard.tsx,
 * ExploreClient.tsx before this file existed). That means a design change
 * like "make it claymorphic" has to touch every page one at a time forever.
 *
 * These five components wrap the `.clay-*` utility classes defined in
 * globals.css. Swapping a raw <div>/<button>/<input> for one of these is a
 * ~1-line diff per usage, and any FUTURE tweak to the clay look (softer
 * shadow, different radius, etc.) only has to happen once, here — not once
 * per page. Start using these in new/edited student UI; no rush to migrate
 * everything that already works.
 *
 * Not student-specific on purpose — owner/staff surfaces can adopt the same
 * look later just by importing from here, without a second component tree.
 */

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/* ─────────────────────────────────────────────────────────────────────────
   ClayCard — the raised "clay block" used for cards, panels, list rows.
   Pass `href` to render as a Link (e.g. LibraryCard); omit it for a plain
   div (e.g. a stat panel). `interactive` adds the hover-lift/press-down
   feel — turn it off for cards that aren't clickable.
───────────────────────────────────────────────────────────────────────── */
type ClayCardProps = {
  href?: string
  interactive?: boolean
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

export function ClayCard({
  href, interactive = true, className, children, ...rest
}: ClayCardProps) {
  const classes = cn('clay-raised overflow-hidden', interactive && 'clay-interactive', className)
  if (href) {
    return (
      <Link href={href} className={classes} {...(rest as any)}>
        {children}
      </Link>
    )
  }
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   ClayButton — pressable puffy button.
   variant="primary" → brand-blue gradient blob (main CTAs)
   variant="flat"    → neutral raised chip (secondary actions, pagination)
   variant="ghost"   → text-only, no shadow (tertiary / icon-only actions)
───────────────────────────────────────────────────────────────────────── */
type ClayButtonVariant = 'primary' | 'flat' | 'ghost'
type ClayButtonSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<ClayButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[12px] rounded-[11px] gap-1',
  md: 'px-4 py-2.5 text-[13px] rounded-[14px] gap-1.5',
  lg: 'px-5 py-3 text-[14px] rounded-[16px] gap-2',
}

type ClayButtonProps = {
  variant?: ClayButtonVariant
  size?: ClayButtonSize
  href?: string
  className?: string
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>

export const ClayButton = React.forwardRef<HTMLButtonElement, ClayButtonProps>(
  function ClayButton({ variant = 'primary', size = 'md', href, className, children, ...rest }, ref) {
    const classes = cn(
      'tap-target inline-flex items-center justify-center font-semibold select-none',
      SIZE_CLASSES[size],
      variant === 'primary' && 'clay-btn-primary',
      variant === 'flat' && 'clay-raised-sm clay-interactive text-[#1C2333]',
      variant === 'ghost' && 'text-[#6E7F94] hover:text-[#1246FF] active:opacity-70 transition-colors',
      rest.disabled && 'cursor-not-allowed',
      className,
    )
    if (href) {
      return (
        <Link href={href} className={classes} {...(rest as any)}>
          {children}
        </Link>
      )
    }
    return (
      <button ref={ref} className={classes} {...rest}>
        {children}
      </button>
    )
  },
)

/* ─────────────────────────────────────────────────────────────────────────
   ClayChip — small pill for status/rating/amenity/count badges.
───────────────────────────────────────────────────────────────────────── */
type ClayChipTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'dark'

const TONE_CLASSES: Record<ClayChipTone, string> = {
  neutral: 'text-[#6E7F94]',
  success: 'bg-[#D1FAE5]/90 text-[#0D7C54]',
  danger:  'bg-[#FEE2E2]/90 text-[#C5282C]',
  warning: 'bg-[#FEF3C7]/90 text-[#92400E]',
  info:    'bg-[#E8EFFE]/90 text-[#1246FF]',
  dark:    'bg-black/35 text-white',
}

export function ClayChip({
  tone = 'neutral', className, children, ...rest
}: { tone?: ClayChipTone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('clay-chip text-[10px] font-bold px-2.5 py-1', TONE_CLASSES[tone], className)}
      {...rest}
    >
      {children}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   ClayIconBadge — rounded-square "pebble" holding an icon (logo mark,
   hamburger button, amenity glyph, avatar fallback container).
───────────────────────────────────────────────────────────────────────── */
type ClayIconBadgeSize = 'sm' | 'md' | 'lg'
const ICON_SIZE_CLASSES: Record<ClayIconBadgeSize, string> = {
  sm: 'w-7 h-7 rounded-[10px]',
  md: 'w-9 h-9 rounded-[12px]',
  lg: 'w-11 h-11 rounded-[14px]',
}

export function ClayIconBadge({
  size = 'md', interactive = false, className, children,
}: {
  size?: ClayIconBadgeSize
  interactive?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn(
      'clay-icon-badge flex items-center justify-center flex-shrink-0',
      interactive && 'clay-interactive',
      ICON_SIZE_CLASSES[size],
      className,
    )}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   ClayToggleChip — the pill-filter pattern (Near Me, Open Now, amenity
   toggles, view-mode switches). Off = raised, On = pressed-in + brand text.
───────────────────────────────────────────────────────────────────────── */
export function ClayToggleChip({
  active = false, className, children, ...rest
}: { active?: boolean; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  return (
    <button
      className={cn(
        'clay-interactive tap-target flex-shrink-0 inline-flex items-center gap-1.5',
        'h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors',
        active ? 'clay-pressed text-[#1246FF]' : 'clay-raised-sm text-[#6E7F94] hover:text-[#1C2333]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   ClayInput / ClaySelect — sunken "groove" fields.
───────────────────────────────────────────────────────────────────────── */
export const ClayInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function ClayInput({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'clay-input w-full px-3.5 py-2.5 text-[13px] text-[#0D1117] placeholder:text-[#9AACBE]',
          className,
        )}
        {...rest}
      />
    )
  },
)

export const ClaySelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function ClaySelect({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'clay-input w-full px-3.5 py-2.5 text-[13px] text-[#0D1117] appearance-none cursor-pointer',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    )
  },
)
