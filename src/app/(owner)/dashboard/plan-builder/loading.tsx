import {Bone, card}  from '@/components/owner/skeletons/Bone'

export default function PlanBuilderLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      <Bone width={140} height={26} style={{ marginBottom: 8 }} />
      <Bone width={300} height={13} style={{ marginBottom: 24 }} />
      {/* Info banner */}
      <Bone width="100%" height={44} borderRadius={12} style={{ marginBottom: 20 }} />
      {/* Plan cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
        {[0,1,2].map(i => (
          <div key={i} style={card}>
            <Bone width={120} height={15} style={{ marginBottom: 8 }} />
            <Bone width={80}  height={30} style={{ marginBottom: 16 }} />
            <Bone width="100%" height={8} borderRadius={4} style={{ marginBottom: 12 }} />
            <Bone width={140} height={22} borderRadius={20} style={{ marginBottom: 12 }} />
            <Bone width="100%" height={5} borderRadius={4} style={{ marginBottom: 8 }} />
            <Bone width={100} height={11} />
          </div>
        ))}
      </div>
    </div>
  )
}