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
        // bottom-[92px] clears the mobile bottom tab bar (student/owner/
        // staff, ~56–85px tall incl. safe-area) with a small gap; lg:
        // reverts to the original bottom-6 since there's no tab bar on
        // desktop. Previously this sat at a flat bottom-6 everywhere,
        // which put it directly behind/under the new tab bars on mobile.
        className="fixed bottom-[92px] lg:bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue text-white shadow-blue-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {isOpen && <ChatPanel onClose={() => setIsOpen(false)} />}
    </>
  )
}
