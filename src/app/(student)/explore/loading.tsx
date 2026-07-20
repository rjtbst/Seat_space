// app/(student)/explore/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function ExploreLoading() {
  return (
    <div className="p-5 max-w-6xl mx-auto">
      {/* search/filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <Bone width="100%" height={44} rounded="rounded-xl" className="flex-1" />
        <Bone width={100} height={44} rounded="rounded-xl" />
      </div>
      <div className="flex gap-2 mb-6">
        {[0, 1, 2].map((i) => (
          <Bone key={i} width={84} height={32} rounded="rounded-full" />
        ))}
      </div>

      {/* library card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="overflow-hidden p-0">
            <Bone width="100%" height={140} rounded="rounded-none" />
            <div className="p-4">
              <Bone width="70%" height={16} className="mb-2" />
              <Bone width="50%" height={12} className="mb-3" />
              <div className="flex gap-2 mb-3">
                <Bone width={28} height={20} rounded="rounded-md" />
                <Bone width={28} height={20} rounded="rounded-md" />
                <Bone width={28} height={20} rounded="rounded-md" />
              </div>
              <Bone width="40%" height={14} />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
