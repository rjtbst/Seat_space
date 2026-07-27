'use client'

// src/components/chat/ChatPanel.tsx

import { useEffect, useRef, useState } from 'react'
import { Send, X, Sparkles, RotateCcw } from 'lucide-react'
import { useChat } from './useChat'
import { MessageBubble } from './MessageBubble'

const SUGGESTIONS = [
  'How does seat booking work?',
  'What plans do you offer?',
  'How do I list my library?',
]

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const { status, messages, errorMessage, activeToolName, send, retryLast } = useChat()
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeToolName])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 250)
  }, [])

  // The input is disabled while streaming (below), which drops focus in
  // most browsers. Restore it the moment a reply finishes — without this,
  // the user has to click back into the box after every single message.
  useEffect(() => {
    if (status !== 'streaming') {
      const id = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [status])

  const submit = (text?: string) => {
    const value = (text ?? input).trim()
    if (!value) return
    setInput('')
    send(value)
  }

  return (
    <div
      // bottom-[156px] keeps this sitting just above the repositioned
      // launcher button (now at bottom-[92px] + its own 56px height + a
      // gap) so the panel doesn't open underneath/behind the mobile tab
      // bar; lg: reverts to the original desktop position.
      className="fixed bottom-[156px] lg:bottom-24 right-6 z-50 w-[360px] sm:w-[400px] flex flex-col rounded-2xl overflow-hidden shadow-xl border border-divider bg-surface max-w-[calc(100vw-2rem)]"
      style={{ maxHeight: 'calc(100vh - 240px)', height: '560px' }}
    >
      {/* Header */}
      <div className="bg-ink px-4 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-cream text-sm">seatspace Assistant</h3>
            <p className="text-[11px] text-pale">Ask about bookings, plans, or your library</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
          aria-label="Close chat"
        >
          <X size={15} className="text-cream" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg">
        {messages.length === 0 && status !== 'loading-history' && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Hi! I can help with seat bookings, plans, your library, and more. Ask me anything.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="px-3 py-1.5 rounded-full text-[12px] bg-surface border border-divider text-ink-2 hover:border-blue hover:text-blue transition-colors font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {activeToolName && (
          <p className="text-[11px] text-muted pl-10 -mt-2">Looking that up…</p>
        )}

        {status === 'error' && errorMessage && (
          <div className="flex items-center justify-between gap-2 bg-brand-red-lt border border-brand-red/20 text-brand-red text-[13px] rounded-lg px-3 py-2">
            <span>{errorMessage}</span>
            <button onClick={retryLast} className="flex items-center gap-1 font-medium shrink-0">
              <RotateCcw size={12} /> Retry
            </button>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-divider bg-surface shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Ask a question…"
            disabled={status === 'streaming'}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-bg border border-divider text-sm text-ink placeholder-pale outline-none focus:border-blue transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => submit()}
            disabled={!input.trim() || status === 'streaming'}
            className="w-10 h-10 rounded-xl bg-blue text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-dk transition-colors"
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
