// Can inline in each loading.tsx OR extract to src/components/owner/skeletons/Bone.tsx

export const card: React.CSSProperties = {
  background: '#FDFCF9', border: '1px solid #E2DDD4',
  borderRadius: 14, padding: '18px 20px',
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