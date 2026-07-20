// src/app/(admin)/admin/subscriptions/page.tsx
import { listSubscriptionsForAdmin } from '@/lib/actions/admin-subscriptions'
import AdminSubscriptionsClient from '@/components/admin/AdminSubscriptionsClient'

export const dynamic = 'force-dynamic'

export default async function AdminSubscriptionsPage() {
  const result = await listSubscriptionsForAdmin()
  return <AdminSubscriptionsClient subscriptions={result.success ? result.data : []} loadError={!result.success ? result.error : null} />
}
