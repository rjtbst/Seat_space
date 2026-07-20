/**
 * Mirrors DashboardClient layout exactly — same grid, same card positions.
 * Shown instantly when navigating to /dashboard. Feels native.
 */
export function DashboardSkeleton() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: 24 }}>
        <Bone width={200} height={28} borderRadius={8} />
        <Bone width={280} height={14} borderRadius={6} style={{ marginTop: 8 }} />
      </div>

      {/* 4-up stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={cardBase}>
            <Bone width={80}  height={11} borderRadius={4} />
            <Bone width={100} height={28} borderRadius={6} style={{ marginTop: 12 }} />
            <Bone width={120} height={12} borderRadius={4} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...cardBase, height: 220 }} />
          <div style={{ ...cardBase, height: 300 }} />
        </div>
        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...cardBase, height: 160 }} />
          <div style={{ ...cardBase, height: 200 }} />
          <div style={{ ...cardBase, height: 180 }} />
        </div>
      </div>
    </div>
  )
}

const cardBase: React.CSSProperties = {
  background: '#FDFCF9', border: '1px solid #E2DDD4',
  borderRadius: 14, padding: '18px 20px',
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

// Add this once globally (in layout or globals.css):
// @keyframes shimmer { 0%,100% { opacity:1 } 50% { opacity:.5 } }