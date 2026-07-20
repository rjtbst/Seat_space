// Mirrors BookingsClient layout
export default function BookingsLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <Bone width={180} height={26} borderRadius={8} />
      <Bone width={260} height={13} borderRadius={5} style={{ marginTop: 8, marginBottom: 20 }} />

      {/* Slot filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[80,90,70,85,75,70].map((w, i) => (
          <Bone key={i} width={w} height={30} borderRadius={20} />
        ))}
      </div>

      {/* Mini stat cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ flex:1, background: '#FDFCF9', border: '1px solid #E2DDD4', borderRadius: 12, padding: '12px 14px' }}>
            <Bone width={36} height={24} borderRadius={6} />
            <Bone width={50} height={10} borderRadius={4} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div style={{ background: '#FDFCF9', border: '1px solid #E2DDD4', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: '#F9F8F5', borderBottom: '1px solid #E2DDD4', display: 'flex', gap: 12 }}>
          {[50,120,90,80,100,80,60].map((w, i) => (
            <Bone key={i} width={w} height={10} borderRadius={4} />
          ))}
        </div>
        {[0,1,2,3,4,5,7,8].map(i => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 14px', borderBottom: '1px solid #F0EDE8' }}>
            {[50,120,90,80,100,80,60].map((w, j) => (
              <Bone key={j} width={w} height={12} borderRadius={4} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Bone({ width, height, borderRadius = 6, style }: {
  width: number | string; height: number; borderRadius?: number; style?: React.CSSProperties
}) {
  return (
    <div style={{
      width, height, borderRadius, background: '#E8E4DC',
      animation: 'shimmer 1.4s ease-in-out infinite',
      ...style,
    }} />
  )
}