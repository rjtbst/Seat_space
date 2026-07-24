'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_LINKS } from '@/lib/config'
import { useStickyNav } from '@/hooks'
import Image from 'next/image'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { homeForRole } from '@/lib/auth/state'
import { signOut } from '@/lib/actions/auth'

function smoothScroll(hash) {
  const el = document.querySelector(hash)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }
  return false
}

export default function Navbar() {
  const scrolled = useStickyNav()
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const toggleBtnRef = useRef(null)
  const panelRef = useRef(null)

  // Signed-in state for this navbar (used on marketing pages, which a
  // logged-in user can still land on). Defaults to signed-out so
  // anonymous visitors -- the overwhelming majority here -- never see a
  // flash of the wrong UI while this resolves.
  const [auth, setAuth] = useState({ status: 'loading', role: null })

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    let active = true

    async function loadAuthState() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return
      if (!user) {
        setAuth({ status: 'signedOut', role: null })
        return
      }
      const { data: row } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (!active) return
      setAuth({ status: 'signedIn', role: row?.role ?? 'student' })
    }

    loadAuthState()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAuthState()
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // If we arrived on '/' carrying a '#section' from another page, finish the
  // scroll once the homepage (and its sections) have actually mounted.
  useEffect(() => {
    if (pathname !== '/' || !window.location.hash) return
    const hash = window.location.hash
    const raf = requestAnimationFrame(() => {
      setTimeout(() => smoothScroll(hash), 50)
    })
    return () => cancelAnimationFrame(raf)
  }, [pathname])

  // Belt-and-suspenders: close the mobile menu on any route change, even
  // if a click handler somewhere didn't explicitly close it first.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Prevent the page underneath from scrolling while the mobile menu is
  // open -- otherwise touch-scrolling the menu also scrolls the page
  // behind it on most mobile browsers.
  useEffect(() => {
    if (!mobileOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [mobileOpen])

  // Escape closes the menu and returns focus to the toggle button, and
  // clicking/tapping outside the panel (the backdrop) closes it too.
  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        toggleBtnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  // Section links (href starting with '#') only exist on the homepage. From
  // any other page, navigate to '/' + hash first, then scroll once mounted.
  // Page links (href starting with '/') use normal Next.js routing. Either
  // way, a click on any nav item closes the mobile menu.
  const handleNavClick = (e, href) => {
    setMobileOpen(false)
    if (!href.startsWith('#')) return // real page link — let <Link> handle it
    e.preventDefault()
    if (pathname === '/') {
      smoothScroll(href)
    } else {
      router.push(`/${href}`)
    }
  }

  const linkHref = (href) => (href.startsWith('#') && pathname !== '/' ? `/${href}` : href)

  const dashboardHref = auth.status === 'signedIn' ? homeForRole(auth.role) : '/explore'

  return (
    <>
      <nav
        className={cn(
          'fixed top-0 left-0 right-0 z-[100] h-16 flex items-center px-6 md:px-10 transition-all duration-300',
          scrolled
            ? 'bg-surface/95 backdrop-blur-md border-b border-divider shadow-sm'
            : 'bg-transparent'
        )}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-1 group">
          <Image
            src="/logo.png"
            alt="Seatspace Logo"
            width={70}
            height={70}
            className="transition-transform duration-200 group-hover:scale-105"
            priority
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={linkHref(link.href)}
              onClick={(e) => handleNavClick(e, link.href)}
              className={cn(
                'text-[13px] font-medium transition-colors duration-150 tracking-[-0.01em] cursor-pointer',
                link.type === 'page' && pathname === link.href
                  ? 'text-ink'
                  : 'text-muted hover:text-ink'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* CTA buttons (desktop) */}
        <div className="hidden md:flex items-center gap-2 ml-8">
          {auth.status === 'signedIn' ? (
            <>
              <Link
                href={dashboardHref}
                className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-white bg-blue hover:bg-blue-dk transition-all duration-150 hover:-translate-y-px tracking-[-0.01em]"
              >
                Go to dashboard →
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-ink border border-divider hover:bg-warm hover:border-gold transition-all duration-150 tracking-[-0.01em]"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-ink border border-divider hover:bg-warm hover:border-gold transition-all duration-150 tracking-[-0.01em]"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-white bg-blue hover:bg-blue-dk transition-all duration-150 hover:-translate-y-px tracking-[-0.01em]"
              >
                Get started free →
              </Link>
            </>
          )}
        </div>

        {/* Hamburger — 44x44 minimum touch target */}
        <button
          ref={toggleBtnRef}
          className="md:hidden ml-auto -mr-1 flex items-center justify-center w-11 h-11 rounded-lg hover:bg-warm active:bg-warm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-panel"
        >
          <div className="w-5 h-4 flex flex-col justify-between">
            <span className={cn('block h-0.5 bg-ink rounded transition-all duration-200', mobileOpen && 'rotate-45 translate-y-[7px]')} />
            <span className={cn('block h-0.5 bg-ink rounded transition-all duration-200', mobileOpen && 'opacity-0')} />
            <span className={cn('block h-0.5 bg-ink rounded transition-all duration-200', mobileOpen && '-rotate-45 -translate-y-[7px]')} />
          </div>
        </button>
      </nav>

      {/* Backdrop — tapping outside the panel closes the menu */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          'fixed inset-0 top-16 z-[98] bg-ink/30 md:hidden transition-opacity duration-300',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Mobile menu panel — always mounted so open/close can transition
          smoothly; height is capped to the viewport (minus the navbar) and
          scrolls internally so content never gets cropped or unreachable
          the way a fixed max-h ever could. */}
      <div
        id="mobile-nav-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!mobileOpen}
        className={cn(
          'fixed inset-x-0 top-16 z-[99] md:hidden',
          'max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain',
          'bg-surface border-b border-divider shadow-lg',
          'transition-all duration-250 ease-out',
          mobileOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        )}
      >
        <div className="px-6 py-3 flex flex-col">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={linkHref(link.href)}
              onClick={(e) => handleNavClick(e, link.href)}
              tabIndex={mobileOpen ? 0 : -1}
              className="py-4 text-[16px] font-medium text-ink border-b border-divider last:border-0 cursor-pointer min-h-[44px] flex items-center"
            >
              {link.label}
            </Link>
          ))}

          {auth.status === 'signedIn' ? (
            <div className="flex flex-col gap-2 pt-4 pb-5">
              <Link
                href={dashboardHref}
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileOpen ? 0 : -1}
                className="w-full py-3.5 rounded-[10px] text-[15px] font-semibold text-white bg-blue text-center min-h-[44px]"
              >
                Go to dashboard →
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  tabIndex={mobileOpen ? 0 : -1}
                  className="w-full py-3.5 rounded-[10px] text-[15px] font-semibold text-ink border border-divider hover:bg-warm transition-all text-center min-h-[44px]"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-4 pb-5">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileOpen ? 0 : -1}
                className="w-full py-3.5 rounded-[10px] text-[15px] font-semibold text-ink border border-divider hover:bg-warm transition-all text-center min-h-[44px]"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileOpen ? 0 : -1}
                className="w-full py-3.5 rounded-[10px] text-[15px] font-semibold text-white bg-blue text-center min-h-[44px]"
              >
                Get started free →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
