// app/(student)/my-books/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function MyBooksLoading() {
  return (
    <div className="p-5 max-w-2xl mx-auto">
      <Bone width={170} height={22} className="mb-4" />

      {/* tabs (active / past) */}
      <div className="flex gap-2 mb-5">
        <Bone width={80} height={34} rounded="rounded-lg" />
        <Bone width={70} height={34} rounded="rounded-lg" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex gap-3">
              <Bone width={44} height={60} rounded="rounded-md" />
              <div className="flex-1">
                <Bone width="65%" height={14} className="mb-2" />
                <Bone width="40%" height={11} className="mb-2" />
                <Bone width="50%" height={11} />
              </div>
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  )
}
