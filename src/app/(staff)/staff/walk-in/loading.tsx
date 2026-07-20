// src/app/(staff)/staff/walk-in/loading.tsx
import { Bone, BoneKeyframes, card } from '@/components/staff/skeletons/Bone'

export default function StaffWalkInLoading() {
  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 480, margin: '0 auto' }}>
      <Bone width={140} height={24} style={{ marginBottom: 6 }} />
      <Bone width={210} height={13} style={{ marginBottom: 18 }} />

      <div style={{ ...card }}>
        <Bone width={150} height={13} style={{ marginBottom: 14 }} />
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
