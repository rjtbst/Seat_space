// src/app/(admin)/admin/libraries/[id]/page.tsx
import { notFound } from 'next/navigation'
import { getLibraryDetailForAdmin } from '@/lib/actions/admin-libraries'
import AdminLibraryDetailClient from '@/components/admin/AdminLibraryDetailClient'

export const dynamic = 'force-dynamic'

export default async function AdminLibraryDetailPage({ params }: { params: { id: string } }) {
  const result = await getLibraryDetailForAdmin(params.id)
  if (!result.success) {
    if (result.error === 'Library not found') notFound()
    return <div style={{ padding: 40, color: '#B91C1C' }}>Failed to load library: {result.error}</div>
  }

  return <AdminLibraryDetailClient library={result.data} />
}
