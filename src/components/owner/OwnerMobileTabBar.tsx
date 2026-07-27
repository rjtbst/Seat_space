'use client'
// src/components/owner/OwnerMobileTabBar.tsx
//
// WHY: Owner dashboard mobile currently only has a top bar + hamburger
// drawer (OwnerSidebar.tsx). Staff already has a bottom tab bar
// (Staffsidebar.tsx) and student now does too (MobileTabBar.tsx) — this
// closes the last gap so all three roles feel like the same app on mobile
// instead of the owner area feeling like a different, older product.
//
// Additive: the hamburger drawer still exists with every nav item, this
// just surfaces the 5 most-used destinations for one-tap thumb reach.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ACCENT } from '@/lib/constants/theme'

const TAB_ITEMS = [
  { href: '/dashboard',              icon: '📊', label: 'Home'     },
  { href: '/dashboard/bookings',     icon: '📋', label: 'Bookings' },
  { href: '/dashboard/seat-manager', icon: '💺', label: 'Seats'    },
  { href: '/dashboard/scanner',      icon: '📷', label: 'Scanner'  },
  { href: '/dashboard/staff',        icon: '👥', label: 'Staff'    },
] as const

export default function OwnerMobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 120,
        display: 'flex', background: 'rgba(253,252,249,.95)',
        backdropFilter: 'blur(10px)', borderTop: '1px solid #E2DDD4',
        height: 58, // fixed so layout.tsx's padding-bottom can clear it precisely
      }}
    >
      {TAB_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              if (pathname !== item.href) (window as any).__startNavProgress?.()
            }}
            className="tap-target press"
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 2, padding: '8px 0',
              fontSize: 10, fontWeight: 600,
              color: active ? ACCENT : '#9AACBE',
              textDecoration: 'none', userSelect: 'none',
            }}
            aria-current={active ? 'page' : undefined}
          >
            <span style={{ fontSize: 19, lineHeight: 1 }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
