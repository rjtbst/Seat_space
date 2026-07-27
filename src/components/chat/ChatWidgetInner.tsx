'use client'

// src/components/chat/ChatWidgetInner.tsx
//
// Loaded via next/dynamic(..., { ssr: false }) from ChatWidget.tsx — this
// file (and everything it imports: framer-motion, the chat hook, etc.)
// never ships in the initial page bundle.

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { ChatPanel } from './ChatPanel'

export default function ChatWidgetInner() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        // bottom-[calc(...)] clears the mobile bottom tab bar (student/
        // owner/staff) plus the device's own safe-area inset (e.g. iPhone
        // home indicator), with extra margin — the earlier flat 92px
        // didn't add the safe-area inset on top of the tab bar height, so
        // on some devices it still sat too low. lg: reverts to the
        // original bottom-6 since there's no tab bar on desktop.
        className="fixed bottom-[calc(100px+env(safe-area-inset-bottom,0px))] lg:bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue text-white shadow-blue-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {isOpen && <ChatPanel onClose={() => setIsOpen(false)} />}
    </>
  )
}
