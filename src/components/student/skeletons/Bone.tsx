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
      className={cn('bg-[#E4EAF2] animate-pulse', rounded, className)}
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
    <div className={cn('bg-white border border-[#E4EAF2] rounded-2xl p-4', className)}>
      {children}
    </div>
  )
}
