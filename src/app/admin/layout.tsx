// src/app/(admin)/admin/layout.tsx
import { requireActiveRole } from '@/lib/auth/guards'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveRole('admin')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F7FB', fontFamily: 'DM Sans, sans-serif' }}>
      <AdminSidebar adminName={profile.full_name ?? 'Admin'} />
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {children}
      </main>
    </div>
  )
}
