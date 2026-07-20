// src/app/(staff)/staff/request/loading.tsx
import { Bone, BoneKeyframes, card } from '@/components/staff/skeletons/Bone'

export default function StaffRequestLoading() {
  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 480, margin: '0 auto' }}>
      <Bone width={180} height={24} style={{ marginBottom: 6 }} />
      <Bone width={240} height={13} style={{ marginBottom: 20 }} />

      <div style={{ ...card }}>
        <Bone width={100} height={12} style={{ marginBottom: 8 }} />
        <Bone width="100%" height={42} borderRadius={10} style={{ marginBottom: 16 }} />
        <Bone width={100} height={12} style={{ marginBottom: 8 }} />
        <Bone width="100%" height={42} borderRadius={10} style={{ marginBottom: 20 }} />
        <Bone width="100%" height={46} borderRadius={10} />
      </div>

      <BoneKeyframes />
    </div>
  )
}
