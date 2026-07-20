// src/app/(staff)/staff/scanner/loading.tsx
import { Bone, BoneKeyframes } from '@/components/staff/skeletons/Bone'

export default function StaffScannerLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 400, margin: '0 auto' }}>
      <Bone width={140} height={26} style={{ marginBottom: 8 }} />
      <Bone width={220} height={13} style={{ marginBottom: 20 }} />
      <Bone width="100%" height={140} borderRadius={16} style={{ marginBottom: 16 }} />
      <Bone width={160} height={12} style={{ marginBottom: 8 }} />
      <Bone width="100%" height={44} borderRadius={9} />
      <BoneKeyframes />
    </div>
  )
}
