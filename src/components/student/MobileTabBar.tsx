'use client'
// src/components/student/MobileTabBar.tsx
//
// WHY: The student shell currently reuses the desktop sidebar pattern on
// mobile (hamburger → slide-over). That works, but it's a *website*
// pattern — every native app in this category (and Instagram/Airbnb, which
// the brief calls out) puts primary destinations in a persistent bottom
// tab bar, because it's reachable with a thumb without any extra tap and
// stays visible while scrolling. This is additive: the hamburger sidebar
// still exists and still contains every nav item, so no destination is
// removed, this just makes the 5 most common ones instantly reachable.
//
// Lives inside StudentShell's layout.tsx (persistent), NOT inside
// PageTransition/template.tsx — it must never re-mount or re-animate on
// navigation, exactly like the sidebar it complements.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, CalendarDays, BookOpen, CreditCard, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TAB_ITEMS = [
  { href: '/explore',       icon: Building2,    label: 'Explore'  },
  { href: '/bookings',      icon: CalendarDays, label: 'Bookings' },
  { href: '/books',         icon: BookOpen,     label: 'Books'    },
  { href: '/subscriptions', icon: CreditCard,   label: 'Plans'    },
  { href: '/profile',       icon: User,         label: 'Profile'  },
] as const

export default function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'lg:hidden fixed bottom-0 left-0 right-0 z-[120] min-h-[58px]',
        'flex items-stretch safe-bottom',
      )}
      style={{
        background: 'var(--clay-surface)',
        boxShadow: '0 -4px 16px rgba(163,177,198,.3)',
      }}
    >
      {TAB_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              if (pathname !== item.href) (window as any).__startStudentNavProgress?.()
            }}
            // tap-target + press give this the same 44px+ hit area and
            // instant-feedback squash as every other primary control —
            // see globals.css for what these two classes do.
            className={cn(
              'tap-target press flex-1 flex flex-col items-center justify-center gap-1',
              'py-2 text-[10px] font-medium select-none',
              active ? 'text-[#1246FF]' : 'text-[#9AACBE]',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <div className={cn(
              'w-9 h-7 rounded-[11px] flex items-center justify-center transition-shadow',
              active && 'clay-pressed',
            )}>
              <item.icon
                className="w-[19px] h-[19px]"
                strokeWidth={active ? 2.4 : 2}
                fill={active ? 'currentColor' : 'none'}
                fillOpacity={active ? 0.12 : 0}
              />
            </div>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
