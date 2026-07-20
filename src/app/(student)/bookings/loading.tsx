// app/(student)/bookings/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function BookingsLoading() {
  return (
    <div className="p-5 max-w-2xl mx-auto">
      <Bone width={140} height={22} className="mb-4" />

      {/* tabs */}
      <div className="flex gap-2 mb-5">
        <Bone width={90} height={34} rounded="rounded-lg" />
        <Bone width={70} height={34} rounded="rounded-lg" />
      </div>

      {/* booking cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex gap-3 mb-3">
              <Bone width={48} height={48} rounded="rounded-xl" />
              <div className="flex-1">
                <Bone width="60%" height={14} className="mb-2" />
                <Bone width="40%" height={11} />
              </div>
              <Bone width={64} height={22} rounded="rounded-full" />
            </div>
            <Bone width="100%" height={1} className="mb-3" />
            <div className="flex gap-4">
              <Bone width={90} height={11} />
              <Bone width={90} height={11} />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
