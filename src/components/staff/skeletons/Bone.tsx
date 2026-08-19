// src/components/staff/skeletons/Bone.tsx
// Mirrors src/components/owner/skeletons/Bone.tsx, using staff's own palette
// (#FDFCF9 card bg / #E2DDD4 border, vs owner's slightly different tones)
// so loading.tsx skeletons match each area's actual rendered look rather
// than a generic gray box that flashes oddly against the real page.

export const card: React.CSSProperties = {
  background: 'var(--clay-surface, #F6F8FC)', border: 'none',
  borderRadius: 20, padding: '18px 20px',
  boxShadow: '6px 6px 14px rgba(163,177,198,.3), -5px -5px 12px rgba(255,255,255,.7)',
}

export function Bone({ width, height, borderRadius = 6, style }: {
  width: number | string
  height: number
  borderRadius?: number | string
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      width, height, borderRadius, background: '#EFEAE0',
      animation: 'staff-bone-shimmer 1.4s ease-in-out infinite', flexShrink: 0,
      ...style,
    }} />
  )
}

/**
 * Inline <style> tag for the shimmer keyframes — staff pages don't share a
 * global layout-level <style> block the way owner's dashboard layout does,
 * so each loading.tsx using Bone should render this once alongside it.
 */
export function BoneKeyframes() {
  return (
    <style dangerouslySetInnerHTML={{
      __html: `@keyframes staff-bone-shimmer { 0%,100% { opacity:1 } 50% { opacity:.45 } }`,
    }} />
  )
}
