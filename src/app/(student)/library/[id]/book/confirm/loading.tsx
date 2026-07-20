// app/(student)/library/[id]/book/confirm/loading.tsx
import { Bone } from '@/components/student/skeletons/Bone'

export default function BookingConfirmLoading() {
  return (
    <div className="min-h-screen bg-[#F4F7FB] flex items-start justify-center pt-10 px-4 pb-16">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[#E4EAF2] shadow-sm overflow-hidden">
          <div className="h-1.5 bg-[#E4EAF2]" />
          <div className="p-6 text-center">
            <Bone width={64} height={64} rounded="rounded-full" className="mx-auto mb-4" />
            <Bone width="70%" height={20} className="mx-auto mb-2" />
            <Bone width="85%" height={13} className="mx-auto mb-4" />
            <Bone width={160} height={32} rounded="rounded-lg" className="mx-auto" />
          </div>
          <div className="border-t border-[#E4EAF2] divide-y divide-[#E4EAF2]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 px-6 py-4">
                <Bone width={16} height={16} rounded="rounded" />
                <div className="flex-1">
                  <Bone width="30%" height={10} className="mb-1.5" />
                  <Bone width="70%" height={13} />
                </div>
              </div>
            ))}
          </div>
          <div className="p-5 space-y-3">
            <Bone width="100%" height={48} rounded="rounded-xl" />
            <Bone width="100%" height={48} rounded="rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
