// src/components/admin/AdminSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/actions/auth'

const ACCENT       = '#7C3AED'

const NAV_ITEMS = [
  { href: '/admin',               label: 'Dashboard',     icon: '📊' },
  { href: '/admin/libraries',     label: 'Libraries',     icon: '📚' },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: '🔁' },
  { href: '/admin/payments',      label: 'Payments',      icon: '💳' },
  { href: '/admin/refunds',       label: 'Refunds',       icon: '↩️' },
  { href: '/admin/payouts',       label: 'Payouts',       icon: '💸' },
  { href: '/admin/observability', label: 'Observability', icon: '🛰️' },
]

export default function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 240, flexShrink: 0, background: '#0A0D12', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', padding: '24px 16px',
      position: 'sticky', top: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, padding: '0 8px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: ACCENT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>🛡️</div>
        <div>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: 0, fontFamily: 'Syne, sans-serif' }}>
            Platform Admin
          </p>
          <p style={{ color: '#8B95A5', fontSize: 11, margin: 0 }}>StudySpace</p>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
                fontSize: 13.5, fontWeight: active ? 700 : 500,
                color: active ? '#fff' : '#A6AEBA',
                background: active ? ACCENT : 'transparent',
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ borderTop: '1px solid #1E232C', paddingTop: 16, marginTop: 16 }}>
        <p style={{ color: '#8B95A5', fontSize: 11, marginBottom: 8, padding: '0 8px' }}>
          Signed in as<br />
          <span style={{ color: '#fff', fontWeight: 600 }}>{adminName}</span>
        </p>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1.5px solid #2A2F3A', color: '#A6AEBA',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
