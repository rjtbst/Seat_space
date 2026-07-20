// app/(student)/payments/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function PaymentsLoading() {
  return (
    <div className="p-5 max-w-2xl mx-auto">
      <Bone width={160} height={22} className="mb-5" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <Bone width="55%" height={14} className="mb-2" />
                <Bone width="35%" height={11} />
              </div>
              <Bone width={70} height={20} rounded="rounded-full" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
