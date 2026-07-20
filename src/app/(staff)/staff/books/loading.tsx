// src/app/(staff)/staff/books/loading.tsx
import { Bone, BoneKeyframes, card } from '@/components/staff/skeletons/Bone'

export default function StaffBooksLoading() {
  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 480, margin: '0 auto' }}>
      <Bone width={140} height={24} style={{ marginBottom: 14 }} />

      {/* tab bar — 4 tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {[0, 1, 2, 3].map(i => <Bone key={i} width="100%" height={34} borderRadius={10} />)}
      </div>

      {/* content list */}
      {[0, 1, 2].map(i => (
        <div key={i} style={{ ...card, marginBottom: 10 }}>
          <Bone width="55%" height={14} style={{ marginBottom: 8 }} />
          <Bone width="35%" height={11} style={{ marginBottom: 10 }} />
          <Bone width="100%" height={34} borderRadius={8} />
        </div>
      ))}

      <BoneKeyframes />
    </div>
  )
}
