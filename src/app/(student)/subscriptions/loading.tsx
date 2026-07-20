// app/(student)/subscriptions/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function SubscriptionsLoading() {
  return (
    <div className="p-5 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <Bone width={180} height={22} />
        <Bone width={100} height={36} rounded="rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex gap-3 mb-3">
              <Bone width={40} height={40} rounded="rounded-xl" />
              <div className="flex-1">
                <Bone width="50%" height={14} className="mb-2" />
                <Bone width="35%" height={11} />
              </div>
              <Bone width={60} height={20} rounded="rounded-full" />
            </div>
            <Bone width="100%" height={1} className="mb-3" />
            <Bone width="80%" height={12} />
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
