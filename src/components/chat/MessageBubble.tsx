'use client'

// src/components/chat/MessageBubble.tsx

import { User, Sparkles } from 'lucide-react'
import { MiniMarkdown } from './MiniMarkdown'
import type { ChatUIMessage } from './useChat'

export function MessageBubble({ message }: { message: ChatUIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isUser ? 'bg-ink-2 text-cream' : 'bg-blue text-white shadow-sm'
        }`}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>

      <div className="flex-1 max-w-[85%]">
        <div
          className={`rounded-xl px-3.5 py-2.5 ${
            isUser
              ? 'bg-blue text-white rounded-tr-sm'
              : 'bg-surface text-ink border border-divider rounded-tl-sm'
          }`}
        >
          {message.content ? (
            <div className={isUser ? 'text-white [&_code]:bg-blue-dk [&_code]:text-white' : ''}>
              <MiniMarkdown content={message.content} />
            </div>
          ) : message.streaming ? (
            <TypingDots />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex gap-1.5 items-center py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-pale animate-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}
