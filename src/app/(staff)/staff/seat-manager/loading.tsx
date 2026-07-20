// src/app/(staff)/staff/seat-manager/loading.tsx
import { Bone, BoneKeyframes, card } from '@/components/staff/skeletons/Bone'

export default function StaffSeatManagerLoading() {
  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 480, margin: '0 auto' }}>
      <Bone width={150} height={24} style={{ marginBottom: 6 }} />
      <Bone width={200} height={13} style={{ marginBottom: 18 }} />

      {/* legend row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => <Bone key={i} width={64} height={20} borderRadius={20} />)}
      </div>

      {/* seat grid — 5 rows x 6 seats, generic shape just to convey "grid loading" */}
      <div style={{ ...card }}>
        {[0, 1, 2, 3, 4].map(row => (
          <div key={row} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <Bone width={18} height={18} style={{ marginRight: 2, alignSelf: 'center' }} />
            {[0, 1, 2, 3, 4, 5].map(col => (
              <Bone key={col} width={34} height={34} borderRadius={8} />
            ))}
          </div>
        ))}
      </div>

      <BoneKeyframes />
    </div>
  )
}
