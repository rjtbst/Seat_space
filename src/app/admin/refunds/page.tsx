// src/app/(admin)/admin/refunds/page.tsx
import { listRefundsForAdmin } from '@/lib/actions/admin-refunds'
import AdminRefundsClient from '@/components/admin/AdminRefundsClient'

export const dynamic = 'force-dynamic'

export default async function AdminRefundsPage() {
  const result = await listRefundsForAdmin({}, null)
  const refunds = result.success ? result.data.rows : []
  const initialCursor = result.success ? result.data.nextCursor : null

  return (
    <AdminRefundsClient
      refunds={refunds}
      initialCursor={initialCursor}
      loadError={!result.success ? result.error : null}
    />
  )
}
