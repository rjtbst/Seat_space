// src/app/(staff)/staff/loading.tsx
import { Bone, BoneKeyframes, card } from '@/components/staff/skeletons/Bone'

export default function StaffDashboardLoading() {
  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 480, margin: '0 auto' }}>
      {/* header */}
      <Bone width={160} height={24} style={{ marginBottom: 6 }} />
      <Bone width={220} height={13} style={{ marginBottom: 20 }} />

      {/* occupancy bar */}
      <div style={{ ...card, marginBottom: 16 }}>
        <Bone width={120} height={12} style={{ marginBottom: 10 }} />
        <Bone width="100%" height={10} borderRadius={6} />
      </div>

      {/* 3-col stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...card, padding: '14px 10px', textAlign: 'center' }}>
            <Bone width={36} height={22} style={{ margin: '0 auto 6px' }} />
            <Bone width={50} height={10} style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>

      {/* 2-col action grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[0, 1, 2, 3].map(i => (
          <Bone key={i} width="100%" height={88} borderRadius={14} />
        ))}
      </div>

      <BoneKeyframes />
    </div>
  )
}
