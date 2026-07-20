// app/(student)/books/loading.tsx
import { Bone, SkeletonCard } from '@/components/student/skeletons/Bone'

export default function BooksLoading() {
  return (
    <div className="p-6 max-w-[720px] mx-auto">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-2">
        <Bone width={24} height={24} rounded="rounded-lg" />
        <Bone width={160} height={26} />
      </div>
      <Bone width={260} height={13} className="mb-6" />

      {/* Search bar row — city input + search input */}
      <div className="flex gap-2 mb-5">
        <Bone width={140} height={42} rounded="rounded-[9px]" />
        <Bone width="100%" height={42} rounded="rounded-[9px]" />
      </div>

      {/* Result group — library header + 3 book rows */}
      {Array.from({ length: 2 }).map((_, gi) => (
        <SkeletonCard key={gi} className="mb-4 p-0 overflow-hidden">

          {/* Library header bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#F8FAFC] border-b border-[#E4EAF2]">
            <div>
              <Bone width={180} height={14} className="mb-1.5" />
              <Bone width={100} height={11} />
            </div>
            <Bone width={90} height={28} rounded="rounded-full" />
          </div>

          {/* Book rows */}
          {Array.from({ length: 3 }).map((_, ri) => (
            <div
              key={ri}
              className="flex items-center gap-3 px-4 py-3 border-b border-[#F4F7FB] last:border-0"
            >
              <div className="flex-1 space-y-1.5">
                <Bone width="55%" height={13} />
                <Bone width="35%" height={11} />
                <Bone width={110} height={18} rounded="rounded-full" />
              </div>
              <Bone width={90} height={34} rounded="rounded-lg" />
            </div>
          ))}
        </SkeletonCard>
      ))}
    </div>
  )
}