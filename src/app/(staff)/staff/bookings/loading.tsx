// src/app/(staff)/staff/bookings/loading.tsx
import { Bone, BoneKeyframes, card } from '@/components/staff/skeletons/Bone'

export default function StaffBookingsLoading() {
  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 480, margin: '0 auto' }}>
      <Bone width={150} height={24} style={{ marginBottom: 6 }} />
      <Bone width={200} height={13} style={{ marginBottom: 18 }} />

      {/* stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...card, padding: '10px 6px', textAlign: 'center' }}>
            <Bone width={28} height={18} style={{ margin: '0 auto 4px' }} />
            <Bone width={40} height={9} style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>

      {/* filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[0, 1, 2].map(i => <Bone key={i} width={72} height={28} borderRadius={20} />)}
      </div>

      {/* booking card list */}
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ ...card, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Bone width={42} height={42} borderRadius={10} />
          <div style={{ flex: 1 }}>
            <Bone width="60%" height={13} style={{ marginBottom: 6 }} />
            <Bone width="40%" height={11} />
          </div>
          <Bone width={56} height={24} borderRadius={8} />
        </div>
      ))}

      <BoneKeyframes />
    </div>
  )
}
