import {Bone, card}  from '@/components/owner/skeletons/Bone'

export default function SeatManagerLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <Bone width={140} height={26} style={{ marginBottom: 8 }} />
      <Bone width={200} height={13} style={{ marginBottom: 24 }} />
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...card, padding: '10px 16px', minWidth: 70, textAlign: 'center' }}>
            <Bone width={30} height={22} style={{ margin: '0 auto 6px' }} />
            <Bone width={50} height={10} style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>
      {/* Floor grid */}
      <div style={{ ...card, padding: '16px 18px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <Bone width={24} height={14} />
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: 10 }).map((_,j) => <Bone key={j} width={36} height={36} borderRadius={8} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}