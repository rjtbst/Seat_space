'use client'

// src/components/chat/ChatWidget.tsx
//
// Mount this once, near the root layout's <body>. It renders nothing until
// the dynamic import resolves, and ChatWidgetInner + its dependencies are
// excluded from the initial bundle (ssr: false, no loading fallback needed
// since a floating button popping in a beat late is unnoticeable).

import dynamic from 'next/dynamic'

const ChatWidgetInner = dynamic(() => import('./ChatWidgetInner'), { ssr: false })

export default function ChatWidget() {
  return <ChatWidgetInner />
}
