import {Bone, card}  from '@/components/owner/skeletons/Bone'

export default function SlotConfigLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <Bone width={180} height={26} style={{ marginBottom: 8 }} />
      <Bone width={240} height={13} style={{ marginBottom: 24 }} />
      {/* Table skeleton */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#F9F8F5', borderBottom: '1px solid #E2DDD4', display: 'flex', gap: 16 }}>
          {[120,90,80,120,60,50].map((w,i) => <Bone key={i} width={w} height={10} />)}
        </div>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '13px 16px', borderBottom: '1px solid #F0EDE8' }}>
            {[120,90,80,120,60,50].map((w,j) => <Bone key={j} width={w} height={12} />)}
          </div>
        ))}
      </div>
    </div>
  )
}