// src/app/(admin)/admin/layout.tsx
import { requireActiveRole } from '@/lib/auth/guards'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveRole('admin')

  return (
    <div style={{ minHeight: '100vh', background: '#F4F7FB', fontFamily: 'DM Sans, sans-serif' }}>
      <AdminSidebar adminName={profile.full_name ?? 'Admin'} />

      <main
        className="admin-main"
        style={{
          marginLeft: 240, minHeight: '100vh', boxSizing: 'border-box',
          padding: '28px 32px', maxWidth: 1400,
        }}
      >
        {children}
      </main>

      <style>{`
        .admin-main { width: 100%; }

        /* Card / metric grids used across admin pages */
        .admin-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .admin-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .admin-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .admin-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
        .admin-detail-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }

        /* Tables shouldn't break the layout on narrow screens */
        .admin-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .admin-table-wrap table { min-width: 640px; }

        @media (max-width: 1200px) {
          .admin-grid-5 { grid-template-columns: repeat(3, 1fr); }
          .admin-grid-4 { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 1024px) {
          .admin-detail-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 900px) {
          .admin-grid-2 { grid-template-columns: 1fr; }
          .admin-grid-3 { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 767px) {
          .admin-main {
            margin-left: 0 !important;
            padding: 20px 16px !important;
            padding-top: 72px !important;
            max-width: 100% !important;
          }
          .admin-grid-5, .admin-grid-4, .admin-grid-3 { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 480px) {
          .admin-grid-5, .admin-grid-4, .admin-grid-3, .admin-grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
