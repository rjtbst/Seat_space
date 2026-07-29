'use client'

// src/components/chat/ChatWidgetInner.tsx
//
// Loaded via next/dynamic(..., { ssr: false }) from ChatWidget.tsx — this
// file (and everything it imports: framer-motion, the chat hook, etc.)
// never ships in the initial page bundle.

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import { ChatPanel } from './ChatPanel'
import { hasBottomTabBar } from './mobileTabBarOffset'

export default function ChatWidgetInner() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const tabBar = hasBottomTabBar(pathname)

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        // Two real cases, not one guess: student/owner pages have a 58px
        // bottom tab bar to clear (58px + 16px margin = 74px, matching the
        // exact formula StudentShell already uses for its own content
        // padding); every other page (guest/marketing, staff) has no tab
        // bar at all, so it only needs a normal floating-button margin.
        // env(safe-area-inset-bottom) still applies either way for the
        // device's own home-indicator area. lg: reverts to bottom-6 since
        // there's no tab bar or safe-area concern on desktop.
        className={
          (tabBar
            ? 'fixed bottom-[calc(74px+env(safe-area-inset-bottom,0px))]'
            : 'fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))]') +
          ' lg:bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue text-white shadow-blue-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform'
        }
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {isOpen && <ChatPanel onClose={() => setIsOpen(false)} tabBar={tabBar} />}
    </>
  )
}