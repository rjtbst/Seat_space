// src/components/admin/AdminSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { signOut } from '@/lib/actions/auth'
import { useIsMobile } from '@/hooks/useIsMobile'

const ACCENT = '#7C3AED'

const NAV_ITEMS = [
  { href: '/admin',               label: 'Dashboard',     icon: '📊' },
  { href: '/admin/libraries',     label: 'Libraries',     icon: '📚' },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: '🔁' },
  { href: '/admin/payments',      label: 'Payments',      icon: '💳' },
  { href: '/admin/refunds',       label: 'Refunds',       icon: '↩️' },
  { href: '/admin/payouts',       label: 'Payouts',       icon: '💸' },
  { href: '/admin/observability', label: 'Observability', icon: '🛰️' },
]

function SidebarContent({
  adminName,
  pathname,
  isMobile,
  onNavigate,
}: {
  adminName: string
  pathname: string
  isMobile: boolean
  onNavigate?: () => void
}) {
  return (
    <aside style={{
      width: 240, height: '100%', flexShrink: 0, background: '#0A0D12',
      display: 'flex', flexDirection: 'column', padding: '24px 16px',
      boxSizing: 'border-box', overflowY: 'auto',
      boxShadow: isMobile ? 'none' : '6px 0 20px rgba(0,0,0,.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            flexShrink: 0,
            boxShadow: '3px 3px 8px rgba(0,0,0,.4), -2px -2px 6px rgba(255,255,255,.06)',
          }}>🛡️</div>
          <div>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: 0, fontFamily: 'Syne, sans-serif' }}>
              Platform Admin
            </p>
            <p style={{ color: '#8B95A5', fontSize: 11, margin: 0 }}>seatspace</p>
          </div>
        </div>
        {isMobile && (
          <button
            onClick={onNavigate}
            aria-label="Close menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#8B95A5', padding: 4, flexShrink: 0 }}
          >
            ✕
          </button>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12, textDecoration: 'none',
                fontSize: 13.5, fontWeight: active ? 700 : 500,
                color: active ? '#fff' : '#A6AEBA',
                background: active ? ACCENT : 'transparent',
                boxShadow: active ? 'inset 2px 2px 5px rgba(0,0,0,.35), inset -1px -1px 3px rgba(255,255,255,.08)' : 'none',
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)', paddingTop: 16, marginTop: 16 }}>
        <p style={{ color: '#8B95A5', fontSize: 11, marginBottom: 8, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Signed in as<br />
          <span style={{ color: '#fff', fontWeight: 600 }}>{adminName}</span>
        </p>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,.04)', border: 'none', color: '#A6AEBA',
              boxShadow: '2px 2px 6px rgba(0,0,0,.4), -2px -2px 5px rgba(255,255,255,.05)',
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

export default function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 56,
          background: '#0A0D12', borderBottom: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', zIndex: 100, boxSizing: 'border-box',
          boxShadow: '0 4px 14px rgba(0,0,0,.35)',
        }}>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5, padding: 6 }}
          >
            {[0, 1, 2].map(i => <div key={i} style={{ width: 22, height: 2, background: '#A6AEBA', borderRadius: 2 }} />)}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🛡️</div>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Syne, sans-serif', color: '#fff', letterSpacing: '-0.02em' }}>Platform Admin</span>
          </div>
          <div style={{ width: 32 }} />
        </div>

        {/* Overlay */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(10,13,18,.5)', zIndex: 200, backdropFilter: 'blur(2px)' }}
          />
        )}

        {/* Drawer */}
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, zIndex: 300,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <SidebarContent adminName={adminName} pathname={pathname ?? ''} isMobile onNavigate={() => setDrawerOpen(false)} />
        </div>
      </>
    )
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 240, zIndex: 50 }}>
      <SidebarContent adminName={adminName} pathname={pathname ?? ''} isMobile={false} />
    </div>
  )
}
