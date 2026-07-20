// app/(student)/library/[id]/loading.tsx
import { Bone } from '@/components/student/skeletons/Bone'

export default function LibraryDetailLoading() {
  return (
    <div className="p-5 max-w-3xl mx-auto">
      {/* hero image */}
      <Bone width="100%" height={220} rounded="rounded-2xl" className="mb-5" />

      {/* title row */}
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="flex-1">
          <Bone width="60%" height={22} className="mb-2" />
          <Bone width="40%" height={14} />
        </div>
        <Bone width={80} height={32} rounded="rounded-lg" />
      </div>

      {/* amenities */}
      <div className="flex gap-2 mb-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} width={64} height={28} rounded="rounded-full" />
        ))}
      </div>

      {/* 3-col stat grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[0, 1, 2].map((i) => (
          <Bone key={i} width="100%" height={64} rounded="rounded-xl" />
        ))}
      </div>

      {/* seat picker section */}
      <Bone width={140} height={16} className="mb-3" />
      <Bone width="100%" height={260} rounded="rounded-2xl" />
    </div>
  )
}
