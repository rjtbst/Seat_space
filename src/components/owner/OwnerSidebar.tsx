'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from '@/lib/actions/auth'
import { useOwner } from '@/contexts/OwnerContext'
import { ACCENT, ACCENT_LIGHT, FONT_DISPLAY, FONT_BODY } from '@/lib/constants/theme'
import { useIsMobile } from '@/hooks/useIsMobile'

const NAV = [
  { href: '/dashboard',              icon: '📊', label: 'Dashboard'        },
  { href: '/dashboard/my-libraries', icon: '🏛️', label: 'My Libraries'     },
  { href: '/dashboard/bookings',     icon: '📋', label: "Today's Bookings" },
  { href: '/dashboard/seat-manager', icon: '💺', label: 'Seat Manager'     },
  { href: '/dashboard/scanner',      icon: '📷', label: 'QR Scanner'       },
  { href: '/dashboard/slot-config',  icon: '⏰', label: 'Slot Config'      },
  { href: '/dashboard/plan-builder', icon: '🎯', label: 'Plan Builder'     },
  { href: '/dashboard/coupons',      icon: '🏷️', label: 'Coupons'         },
  { href: '/dashboard/subscribers',  icon: '🎫', label: 'Subscribers'     },
  { href: '/dashboard/staff',        icon: '👥', label: 'Staff'            },
  { href: '/dashboard/billing',      icon: '💳', label: 'Billing & Payouts' },
]

function NavLink({
  href, icon, label, active, onClick,
}: {
  href: string; icon: string; label: string; active: boolean; onClick?: () => void
}) {
const handleClick = useCallback(() => {
  // Don't trigger progress bar if already on this route
  const current = window.location.pathname
  if (current !== href) {
    ;(window as any).__startNavProgress?.()
  }
  onClick?.()
}, [onClick, href])

  return (
    <Link
      href={href}
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 9, marginBottom: 2,
        fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? ACCENT : '#3A4A5C',
        background: active ? ACCENT_LIGHT : 'transparent',
        textDecoration: 'none', transition: 'all .12s',
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      {label}
      {active && (
        <div style={{
          marginLeft: 'auto', width: 6, height: 6,
          borderRadius: '50%', background: ACCENT,
        }} />
      )}
    </Link>
  )
}

function SidebarContent({
  ownerName,
  pathname,
  isMobile,
  onClose,
}: {
  ownerName: string
  pathname: string
  isMobile: boolean
  onClose?: () => void
}) {
  return (
    <aside style={{
      width: 240, height: '100%', background: '#FDFCF9',
      borderRight: isMobile ? 'none' : '1px solid #E2DDD4',
      display: 'flex', flexDirection: 'column',
      boxShadow: isMobile ? 'none' : '2px 0 12px rgba(10,13,18,.05)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 16px', borderBottom: '1px solid #E2DDD4',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: '0 2px 8px rgba(13,124,84,.3)',
          }}>📚</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: FONT_DISPLAY, color: '#0A0D12', letterSpacing: '-0.02em' }}>
              seatspace
            </div>
            <div style={{ fontSize: 10, color: '#9AAAB8', fontWeight: 500 }}>Owner Portal</div>
          </div>
        </div>
        {isMobile && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6B7689', padding: 4 }} aria-label="Close menu">
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9AAAB8', textTransform: 'uppercase', letterSpacing: '.08em', padding: '8px 10px 6px' }}>
          Menu
        </div>
        {NAV.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={active}
              onClick={isMobile ? onClose : undefined}
            />
          )
        })}

        <div style={{ height: 1, background: '#E2DDD4', margin: '10px 4px' }} />
        <Link
          href="/onboarding/add-library"
          onClick={() => (window as any).__startNavProgress?.()}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 9,
            fontSize: 13, fontWeight: 600, color: ACCENT,
            border: `1.5px dashed ${ACCENT}`,
            textDecoration: 'none', background: 'transparent',
          }}
        >
          <span style={{ fontSize: 16 }}>+</span> Add Library
        </Link>
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E2DDD4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#fff', fontWeight: 700, flexShrink: 0,
          }}>
            {ownerName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0D12', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ownerName}
            </div>
            <div style={{ fontSize: 10, color: '#9AAAB8' }}>Library Owner</div>
          </div>
        </div>
        <form action={signOut}>
          <button type="submit" style={{
            width: '100%', padding: '8px 0', borderRadius: 8,
            fontSize: 12, fontWeight: 600, color: '#6B7689',
            border: '1.5px solid #E2DDD4', background: 'transparent',
            cursor: 'pointer', fontFamily: FONT_BODY,
          }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}

export default function OwnerSidebar() {
  const { ownerName }     = useOwner()           // ← from context, no prop needed
  const pathname          = usePathname()
  const isMobile          = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 56,
          background: '#FDFCF9', borderBottom: '1px solid #E2DDD4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', zIndex: 100, boxShadow: '0 2px 8px rgba(10,13,18,.06)',
        }}>
          <button onClick={() => setDrawerOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5, padding: 6 }} aria-label="Open menu">
            {[0,1,2].map(i => <div key={i} style={{ width: 22, height: 2, background: '#3A4A5C', borderRadius: 2 }} />)}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📚</div>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: FONT_DISPLAY, color: '#0A0D12', letterSpacing: '-0.02em' }}>seatspace</span>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff', fontWeight: 700 }}>
            {ownerName.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Overlay */}
        {drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,13,18,.4)', zIndex: 200, backdropFilter: 'blur(2px)' }} />
        )}

        {/* Drawer */}
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, zIndex: 300,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <SidebarContent ownerName={ownerName} pathname={pathname} isMobile onClose={() => setDrawerOpen(false)} />
        </div>
      </>
    )
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 240, zIndex: 50 }}>
      <SidebarContent ownerName={ownerName} pathname={pathname} isMobile={false} />
    </div>
  )
}