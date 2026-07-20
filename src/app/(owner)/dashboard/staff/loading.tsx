import {Bone, card}  from '@/components/owner/skeletons/Bone'

export default function StaffLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>
      <Bone width={160} height={26} style={{ marginBottom: 8 }} />
      <Bone width={240} height={13} style={{ marginBottom: 24 }} />
      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Bone width={80} height={34} borderRadius={9} />
        <Bone width={120} height={34} borderRadius={9} />
      </div>
      {/* Staff list */}
      <div style={card}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F0EDE8', alignItems: 'center' }}>
            <Bone width={36} height={36} borderRadius="50%" />
            <div style={{ flex: 1 }}>
              <Bone width={120} height={14} style={{ marginBottom: 6 }} />
              <Bone width={90}  height={11} />
            </div>
            <Bone width={80} height={28} borderRadius={7} />
            <Bone width={30} height={30} borderRadius={7} />
          </div>
        ))}
      </div>
    </div>
  )
}