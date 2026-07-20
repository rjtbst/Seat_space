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
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue text-white shadow-blue-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {isOpen && <ChatPanel onClose={() => setIsOpen(false)} />}
    </>
  )
}
