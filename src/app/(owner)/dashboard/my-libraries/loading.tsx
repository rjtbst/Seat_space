import {Bone, card}  from '@/components/owner/skeletons/Bone'
export default function MyLibrariesLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <Bone width={160} height={26} style={{ marginBottom: 8 }} />
      <Bone width={220} height={13} style={{ marginBottom: 24 }} />

      {/* 4 summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={card}>
            <Bone width={70}  height={10} />
            <Bone width={80}  height={26} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>

      {/* Library cards */}
      {[0,1,2].map(i => (
        <div key={i} style={{ ...card, marginBottom: 12, display: 'flex', gap: 16 }}>
          <Bone width={64} height={64} borderRadius={12} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Bone width={140} height={16} style={{ marginBottom: 8 }} />
            <Bone width={100} height={11} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 20 }}>
              {[0,1,2,3].map(j => <Bone key={j} width={60} height={28} borderRadius={6} />)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {[0,1,2].map(j => <Bone key={j} width={100} height={30} borderRadius={8} />)}
          </div>
        </div>
      ))}
    </div>
  )
}