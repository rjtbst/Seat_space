// src/app/(admin)/admin/libraries/page.tsx
import { listLibrariesForAdmin } from '@/lib/actions/admin-libraries'
import AdminLibrariesClient from '@/components/admin/AdminLibrariesClient'

export const dynamic = 'force-dynamic'

export default async function AdminLibrariesPage() {
  const result = await listLibrariesForAdmin('all', null)
  const libraries = result.success ? result.data.rows : []
  const initialCursor = result.success ? result.data.nextCursor : null

  return (
    <AdminLibrariesClient
      libraries={libraries}
      initialCursor={initialCursor}
    loadError={!result?.success ? (result as { success: false; error: string; }).error : null}
    />
  )
}
