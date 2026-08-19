// components/student/StudentShell.tsx
'use client'

/**
 * Student app shell.
 * Desktop: fixed left sidebar (252px) + top header — matches owner/staff shell design.
 * Mobile:  hamburger menu → slide-over sidebar + fixed top header.
 *
 * Matches the design language from the existing layout (doc 9).
 *
 * PERFORMANCE NOTE: `displayName` is passed in from the server layout
 * (app/(student)/layout.tsx), which already fetches the user's profile via
 * requireRole() for the role check. Previously this component re-fetched
 * the same `users` row again from the browser on every mount — a second,
 * purely-client-side round trip (auth.getUser() + a `users` SELECT) for
 * data the server already had in hand one render earlier. Passing it down
 * as a prop removes that extra request and the brief "Student" placeholder
 * flash while it resolved.
 */

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  BookOpen, Building2, Map, CalendarDays, CreditCard,
  Receipt, Library, Package, User, LogOut,
  Menu, X, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClayIconBadge } from '@/components/ui/clay'
import { getInitials, avatarGradient } from '@/lib/utils'
import NotificationBell from './NotificationBell'
import { StudentNavProgressBar } from './NavProgressBar'
import MobileTabBar from './MobileTabBar'
import PageTransition from '@/components/shared/PageTransition'

const NAV_ITEMS = [
  { href: '/explore',        icon: Building2,    label: 'Find Libraries'    },
  { href: '/bookings',       icon: CalendarDays, label: 'My Bookings'       },
  { href: '/books',          icon: BookOpen,     label: 'Search Books'      },
  { href: '/subscriptions',  icon: CreditCard,   label: 'Membership Plans'  },
  { href: '/payments',       icon: Receipt,      label: 'Payment History'   },
  { href: '/my-books',       icon: Package,      label: 'My Borrowed Books' },
  { href: '/profile',        icon: User,         label: 'My Profile'        },
] as const

export default function StudentShell({
  children,
  displayName,
}: {
  children: React.ReactNode
  displayName?: string | null
}) {
  const pathname = usePathname()
  const router   = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const finalDisplayName = displayName || 'Student'
  const initials         = getInitials(finalDisplayName)
  const gradient         = avatarGradient(finalDisplayName)

  const currentLabel =
    NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'))?.label
    ?? 'LibrarySpot'

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--clay-bg)' }}>
      {/* StudentNavProgressBar needs Suspense because it reads useSearchParams */}
      <Suspense fallback={null}>
        <StudentNavProgressBar />
      </Suspense>

      {/* ── Mobile overlay ─────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/35 z-[150] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────── */}
      <nav
        className={cn(
          'fixed lg:static top-0 left-0 bottom-0 z-[200]',
          'w-[252px] flex flex-col flex-shrink-0',
          'transition-transform duration-250 ease-[cubic-bezier(.4,0,.2,1)]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{
          background: 'var(--clay-surface)',
          boxShadow: '6px 0 20px rgba(163,177,198,.35)',
        }}
      >
        {/* Logo */}
        <div className="px-4 py-[18px] pb-[14px] flex items-center gap-[11px]">
          <div
            className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-[#4D78FF] to-[#0D3AE0] flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '3px 3px 8px rgba(18,70,255,.35), -2px -2px 6px rgba(255,255,255,.5), inset 0 1px 1px rgba(255,255,255,.35)' }}
          >
            <BookOpen className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <div className="font-serif text-[17px] text-[#0D1117]">
              Library<span className="text-[#1246FF] font-bold">Spot</span>
            </div>
            <div className="text-[9px] tracking-[.08em] uppercase text-[#9AACBE] mt-px">
              Student Dashboard
            </div>
          </div>
          <button
            className="ml-auto lg:hidden text-[#6E7F94] hover:text-[#1246FF] transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto py-1.5 px-2.5 scrollbar-none space-y-[3px]">
          <div className="text-[9px] font-bold tracking-[.1em] uppercase text-[#9AACBE] px-[9px] py-3 pb-1">
            🎓 Student
          </div>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  setSidebarOpen(false)
                  if (pathname !== item.href) (window as any).__startStudentNavProgress?.()
                }}
                className={cn(
                  'clay-interactive flex items-center gap-[9px] px-[9px] py-[7px] rounded-[13px] text-[13px] font-medium',
                  'cursor-pointer',
                  active
                    ? 'clay-pressed text-[#1246FF] font-semibold'
                    : 'text-[#6E7F94] hover:text-[#1C2333]',
                )}
              >
                <div className={cn(
                  'w-[30px] h-7 rounded-[9px] flex items-center justify-center flex-shrink-0',
                  active && 'bg-[#1246FF]/12',
                )}>
                  <item.icon className="w-[14px] h-[14px]" />
                </div>
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* User footer */}
        <div className="p-3">
          <div className="clay-raised-sm clay-interactive flex items-center gap-[9px] px-[10px] py-[9px] group cursor-pointer">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{ background: gradient, boxShadow: '2px 2px 6px rgba(163,177,198,.5)' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-[#0D1117] truncate max-w-[130px]">
                {finalDisplayName}
              </div>
              <div className="text-[10px] text-[#9AACBE]">Student</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="opacity-40 group-hover:opacity-70 transition-opacity"
            >
              <LogOut className="w-3.5 h-3.5 text-[#6E7F94]" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header
          className="h-[58px] flex items-center px-5 gap-3 flex-shrink-0 z-[100]"
          style={{ background: 'var(--clay-surface)', boxShadow: '0 4px 16px rgba(163,177,198,.3)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="lg:hidden"
          >
            <ClayIconBadge interactive size="md" className="text-[#6E7F94]">
              <Menu className="w-5 h-5" />
            </ClayIconBadge>
          </button>
          <span className="font-serif text-[17px] text-[#0D1117] tracking-[-0.2px] flex-1 truncate">
            {currentLabel}
          </span>
          <div className="ml-auto flex gap-2">
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        {/* pb-16 reserves space for MobileTabBar (h ~56px + safe-area) so
            the last item in any list is never hidden behind it; lg:pb-0
            removes that reservation once the tab bar itself is hidden. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(58px+env(safe-area-inset-bottom,0px)+16px)] lg:pb-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <MobileTabBar />
    </div>
  )
}