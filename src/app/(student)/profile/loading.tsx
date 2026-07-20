// app/(student)/profile/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function ProfileLoading() {
  return (
    <div className="p-5 max-w-2xl mx-auto">
      {/* avatar header */}
      <div className="flex items-center gap-4 mb-6">
        <Bone width={64} height={64} rounded="rounded-full" />
        <div>
          <Bone width={140} height={18} className="mb-2" />
          <Bone width={100} height={12} />
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[0, 1, 2].map((i) => (
          <Bone key={i} width="100%" height={70} rounded="rounded-xl" />
        ))}
      </div>

      {/* form */}
      <SkeletonCard>
        <Bone width="30%" height={12} className="mb-2" />
        <Bone width="100%" height={42} rounded="rounded-lg" className="mb-4" />
        <Bone width="30%" height={12} className="mb-2" />
        <Bone width="100%" height={42} rounded="rounded-lg" className="mb-4" />
        <Bone width={120} height={40} rounded="rounded-lg" />
      </SkeletonCard>
    </div>
  )
}
