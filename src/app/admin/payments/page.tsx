// src/app/(admin)/admin/payments/page.tsx
import { listPaymentsForAdmin } from '@/lib/actions/admin-refunds'
import AdminPaymentsClient from '@/components/admin/AdminPaymentsClient'

export const dynamic = 'force-dynamic'

export default async function AdminPaymentsPage() {
  const result = await listPaymentsForAdmin({}, null)
  const payments = result.success ? result.data.rows : []
  const initialCursor = result.success ? result.data.nextCursor : null

  return (
    <AdminPaymentsClient
      payments={payments}
      initialCursor={initialCursor}
      loadError={!result.success ? result.error : null}
    />
  )
}
