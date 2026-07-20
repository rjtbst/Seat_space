'use client'

// src/components/staff/StaffSidebar.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { signOut } from '@/lib/actions/auth'

const ACCENT       = '#0597A7'
const ACCENT_LIGHT = '#E0F6F8'

function buildNavItems(isSenior: boolean) {
  return [
    { href: '/staff',                label: 'Home',          emoji: '🏠' },
    { href: '/staff/bookings',       label: 'Bookings',      emoji: '📋' },
    { href: '/staff/scanner',        label: 'Scan QR',       emoji: '📷' },
    isSenior
      ? { href: '/staff/seat-manager', label: 'Seat Manager', emoji: '🗺️' }
      : { href: '/staff/walk-in',      label: 'Walk-in',      emoji: '🪑' },
    { href: '/staff/books',          label: 'Books',         emoji: '📚' },
  ]
}

export default function StaffSidebar({
  role,
  staffName,
}: {
  role?:      string | null
  staffName?: string | null
}) {
  const pathname  = usePathname()
  const isSenior  = role === 'senior_staff'
  const NAV_ITEMS = buildNavItems(isSenior)

  const [isMobile, setIsMobile]     = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const initials = staffName ? staffName.charAt(0).toUpperCase() : '?'

  /* ── Sidebar content (shared between desktop fixed + mobile drawer) ───── */
  const SidebarContent = () => (
    <aside style={{
      width:           220,
      height:          '100%',
      background:      '#FDFCF9',
      borderRight:     '1px solid #E2DDD4',
      display:         'flex',
      flexDirection:   'column',
      boxShadow:       '2px 0 12px rgba(10,13,18,.05)',
    }}>

      {/* Logo row */}
      <div style={{
        padding:        '18px 16px 14px',
        borderBottom:   '1px solid #E2DDD4',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, boxShadow: '0 2px 8px rgba(5,151,167,.3)',
          }}>
            📚
          </div>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 800, fontFamily: 'Syne, sans-serif',
              color: '#0A0D12', letterSpacing: '-0.02em',
            }}>
              seatspace
            </div>
            <div style={{ fontSize: 10, color: '#9AAAB8', fontWeight: 500 }}>
              {isSenior ? 'Senior Staff' : 'Staff Portal'}
            </div>
          </div>
        </div>

        {/* Close — mobile drawer only */}
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: '#6B7689', padding: 4, lineHeight: 1,
            }}
            aria-label="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Senior badge */}
      {isSenior && (
        <div style={{
          margin: '10px 12px 0',
          padding: '6px 10px',
          background: '#EFF6FF',
          border: '1px solid rgba(30,92,255,.2)',
          borderRadius: 8,
          fontSize: 11, fontWeight: 600, color: '#1E5CFF',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ⭐ Senior Staff
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#9AAAB8',
          textTransform: 'uppercase', letterSpacing: '.08em',
          padding: '8px 10px 6px',
        }}>
          Menu
        </div>

        {NAV_ITEMS.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/staff' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (pathname !== item.href) (window as any).__startStaffNavProgress?.()
              }}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            10,
                padding:        '9px 12px',
                borderRadius:   9,
                marginBottom:   2,
                fontSize:       13,
                fontWeight:     active ? 700 : 500,
                color:          active ? ACCENT : '#3A4A5C',
                background:     active ? ACCENT_LIGHT : 'transparent',
                textDecoration: 'none',
                transition:     'all .12s',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>
                {item.emoji}
              </span>
              {item.label}
              {active && (
                <div style={{
                  marginLeft: 'auto', width: 6, height: 6,
                  borderRadius: '50%', background: ACCENT,
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid #E2DDD4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#fff', fontWeight: 700, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: '#0A0D12',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {staffName ?? 'Staff'}
            </div>
            <div style={{ fontSize: 10, color: '#9AAAB8' }}>
              {isSenior ? 'Senior Staff' : 'Staff'}
            </div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%', padding: '7px 0', borderRadius: 8,
              fontSize: 12, fontWeight: 600, color: '#6B7689',
              border: '1.5px solid #E2DDD4', background: 'transparent',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )

  /* ── Mobile: bottom tab bar + optional drawer ─────────────────────────── */
  if (isMobile) {
    return (
      <>
        {/* Bottom tab bar */}
        <nav style={{
          position:   'fixed',
          bottom:     0, left: 0, right: 0,
          height:     64,
          background: '#FDFCF9',
          borderTop:  '1px solid #E2DDD4',
          display:    'flex',
          zIndex:     50,
          boxShadow:  '0 -2px 12px rgba(10,13,18,.06)',
        }}>
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href ||
              (item.href !== '/staff' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (pathname !== item.href) (window as any).__startStaffNavProgress?.()
                }}
                style={{
                  flex:           1,
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            2,
                  textDecoration: 'none',
                  color:          active ? ACCENT : '#9AAAB8',
                  transition:     'color .15s',
                  paddingBottom:  4,
                  position:       'relative',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, filter: active ? 'none' : 'grayscale(40%)' }}>
                  {item.emoji}
                </span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '.02em' }}>
                  {item.label}
                </span>
                {active && (
                  <div style={{
                    position: 'absolute', top: 0,
                    width: 32, height: 2,
                    background: ACCENT, borderRadius: '0 0 2px 2px',
                  }} />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Mobile overlay */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(10,13,18,.4)',
              zIndex: 200, backdropFilter: 'blur(2px)',
            }}
          />
        )}

        {/* Mobile drawer (slide in from left — for any future drawer trigger) */}
        <div style={{
          position:   'fixed',
          top: 0, left: 0, bottom: 0,
          width:      260,
          zIndex:     300,
          transform:  drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
        }}>
          <SidebarContent />
        </div>
      </>
    )
  }

  /* ── Desktop: fixed sidebar ───────────────────────────────────────────── */
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 220, zIndex: 50 }}>
      <SidebarContent />
    </div>
  )
}