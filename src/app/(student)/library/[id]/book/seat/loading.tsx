// app/(student)/library/[id]/book/seat/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function BookSeatLoading() {
  return (
    <div className="p-5 max-w-2xl mx-auto">
      {/* step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2].map((i) => (
          <Bone key={i} width={28} height={28} rounded="rounded-full" />
        ))}
      </div>

      <Bone width="50%" height={20} className="mb-4" />

      <SkeletonCard className="mb-4">
        <Bone width="40%" height={13} className="mb-3" />
        <div className="flex gap-2 mb-4">
          <Bone width={70} height={40} rounded="rounded-lg" />
          <Bone width={10} height={2} className="self-center" />
          <Bone width={70} height={40} rounded="rounded-lg" />
        </div>
        <Bone width="60%" height={13} />
      </SkeletonCard>

      <Bone width="100%" height={220} rounded="rounded-2xl" />
    </div>
  )
}
