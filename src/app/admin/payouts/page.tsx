// src/app/(admin)/admin/payouts/page.tsx
import {
  listPayoutsForAdmin, getPendingSettlements, getPendingNoShowEscrow,
} from '@/lib/actions/admin-payouts'
import AdminPayoutsClient from '@/components/admin/AdminPayoutsClient'

export const dynamic = 'force-dynamic'

export default async function AdminPayoutsPage() {
  const [payoutsRes, settlementsRes, noShowRes] = await Promise.all([
    listPayoutsForAdmin(),
    getPendingSettlements(),
    getPendingNoShowEscrow(),
  ])

  return (
    <AdminPayoutsClient
      payouts={payoutsRes.success ? payoutsRes.data : []}
      pendingSettlements={settlementsRes.success ? settlementsRes.data : []}
      noShowEscrow={noShowRes.success ? noShowRes.data : []}
      loadError={!payoutsRes.success ? payoutsRes.error : null}
    />
  )
}
