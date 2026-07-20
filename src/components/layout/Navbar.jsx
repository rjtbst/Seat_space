'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_LINKS } from '@/lib/config'
import { useStickyNav } from '@/hooks'

function smoothScroll(href) {
  if (!href.startsWith('#')) return false
  const el = document.querySelector(href)
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

  const handleNavClick = (e, href) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      setMobileOpen(false)
      smoothScroll(href)
    }
  }

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
          <div className="w-8 h-8 rounded-[9px] bg-blue flex items-center justify-center shadow-blue flex-shrink-0 transition-transform group-hover:scale-105">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
              <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="2" y="11" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.4"/>
            </svg>
          </div>
          <span className="text-[19px] tracking-[-0.3px] text-ink font-serif">
            Library<span className="text-blue font-bold" style={{ fontFamily: 'inherit' }}>Space</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="text-[13px] font-medium text-muted hover:text-ink transition-colors duration-150 tracking-[-0.01em] cursor-pointer"
            >
              {link.label}
            </a>
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
            className="px-5 py-[9px] rounded-[9px] text-[13px] font-semibold text-white bg-blue shadow-blue hover:bg-blue-dk transition-all duration-150 hover:-translate-y-px tracking-[-0.01em]"
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
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="py-3 text-[15px] font-medium text-ink border-b border-divider last:border-0 cursor-pointer"
            >
              {link.label}
            </a>
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
              className="w-full py-3 rounded-[10px] text-[14px] font-semibold text-white bg-blue shadow-blue text-center"
            >
              Get started free →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}