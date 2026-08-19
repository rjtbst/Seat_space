// src/components/student/skeletons/Bone.tsx
// Tailwind-based skeleton primitive for student loading.tsx files — mirrors
// the inline-style `Bone` used by owner/staff skeletons, but built with
// utility classes since student components (StudentShell, BookingsClient,
// etc.) are already written in Tailwind rather than inline styles.

import { cn } from '@/lib/utils'

export function Bone({
  width,
  height,
  rounded = 'rounded-md',
  className,
}: {
  width:    number | string
  height:   number | string
  rounded?: string
  className?: string
}) {
  return (
    <div
      // Shimmer instead of opacity-pulse: a moving highlight reads as
      // "content is actively arriving" (Instagram/LinkedIn-style), while
      // animate-pulse reads as "something is wrong/stuck" past ~1s.
      // prefers-reduced-motion is handled globally in globals.css.
      className={cn('bone-shimmer', rounded, className)}
      style={{
        width:  typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}

/** A simple bordered card container matching the app's standard card style,
 *  for wrapping groups of Bone elements in a loading.tsx. */
export function SkeletonCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('clay-raised p-4', className)}>
      {children}
    </div>
  )
}
