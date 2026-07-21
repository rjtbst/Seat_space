'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_LINKS } from '@/lib/config'
import { useStickyNav } from '@/hooks'
import Image from "next/image";

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

  // Section links (href starting with '#') only exist on the homepage. From
  // any other page, navigate to '/' + hash first, then scroll once mounted.
  // Page links (href starting with '/') use normal Next.js routing.
  const handleNavClick = (e, href) => {
    if (!href.startsWith('#')) return // real page link — let <Link> handle it
    e.preventDefault()
    setMobileOpen(false)
    if (pathname === '/') {
      smoothScroll(href)
    } else {
      router.push(`/${href}`)
    }
  }

  const linkHref = (href) => (href.startsWith('#') && pathname !== '/' ? `/${href}` : href)

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
    src="/logo.png" // or "/logo.svg"
    alt="LibrarySpace Logo"
    width={70}
    height={70}
    className=" transition-transform duration-200 group-hover:scale-105"
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

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-2 ml-8">
          <Link
            href="/login"
            className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-ink border border-divider hover:bg-warm hover:border-gold transition-all duration-150 tracking-[-0.01em]"
          >
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-white bg-blue  hover:bg-blue-dk transition-all duration-150 hover:-translate-y-px tracking-[-0.01em]"
          >
            Get started free →
          </Link>
        </div>

        {/* Hamburger */}
        <button
          className="md:hidden ml-auto p-2 rounded-lg hover:bg-warm transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <div className="w-5 h-4 flex flex-col justify-between">
            <span className={cn('block h-0.5 bg-ink rounded transition-all duration-200', mobileOpen && 'rotate-45 translate-y-[7px]')} />
            <span className={cn('block h-0.5 bg-ink rounded transition-all duration-200', mobileOpen && 'opacity-0')} />
            <span className={cn('block h-0.5 bg-ink rounded transition-all duration-200', mobileOpen && '-rotate-45 -translate-y-[7px]')} />
          </div>
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        className={cn(
          'fixed inset-x-0 top-16 z-[99] bg-surface border-b border-divider shadow-lg md:hidden transition-all duration-300 overflow-hidden',
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={linkHref(link.href)}
              onClick={(e) => handleNavClick(e, link.href)}
              className="py-3 text-[15px] font-medium text-ink border-b border-divider last:border-0 cursor-pointer"
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-4 pb-2">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="w-full py-3 rounded-[10px] text-[14px] font-semibold text-ink border border-divider hover:bg-warm transition-all text-center"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              onClick={() => setMobileOpen(false)}
              className="w-full py-3 rounded-[10px] text-[14px] font-semibold text-white bg-blue text-center"
            >
              Get started free →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}