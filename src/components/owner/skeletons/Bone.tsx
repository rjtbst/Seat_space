// Can inline in each loading.tsx OR extract to src/components/owner/skeletons/Bone.tsx

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
      width, height, borderRadius, background: '#E8E4DC',
      animation: 'shimmer 1.4s ease-in-out infinite', flexShrink: 0,
      ...style,
    }} />
  )
}