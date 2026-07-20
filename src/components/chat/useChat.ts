'use client'

// src/components/chat/useChat.ts
//
// The only piece of chat state management. Everything UI-facing
// (ChatPanel, MessageList, etc.) reads from this hook and never touches
// lib/chat/memory or lib/chat/providers directly.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getConversationRepository, type ChatConversation, type ChatMessage } from '@/lib/chat/memory'
import { trimForRequest } from '@/lib/chat/memory/trim'

export type ChatUIMessage = ChatMessage & { streaming?: boolean }

type ChatStatus = 'idle' | 'loading-history' | 'streaming' | 'error'

export function useChat() {
  const pathname = usePathname()
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [messages, setMessages] = useState<ChatUIMessage[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeToolName, setActiveToolName] = useState<string | null>(null)

  const repoRef = useRef<Awaited<ReturnType<typeof getConversationRepository>> | null>(null)
  const conversationRef = useRef<ChatConversation | null>(null)

  // ── Restore session on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setStatus('loading-history')
      const resolved = await getConversationRepository()
      if (cancelled) return
      repoRef.current = resolved

      const existing = await resolved.repository.getActiveConversation()
      if (existing) {
        conversationRef.current = existing
        const history = await resolved.repository.listMessages(existing.id)
        if (!cancelled) setMessages(history)
      }
      if (!cancelled) setStatus('idle')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const ensureConversation = useCallback(async (): Promise<ChatConversation> => {
    if (conversationRef.current) return conversationRef.current
    const resolved = repoRef.current ?? (await getConversationRepository())
    repoRef.current = resolved
    const created = await resolved.repository.createConversation({
      route: pathname,
      role: 'guest', // best-effort UI label only; the server derives the real role independently
    })
    conversationRef.current = created
    return created
  }, [pathname])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || status === 'streaming') return

      setErrorMessage(null)
      const conversation = await ensureConversation()
      const repo = repoRef.current!.repository

      const userMessage = await repo.appendMessage(conversation.id, { role: 'user', content: trimmed })
      setMessages((prev) => [...prev, userMessage])
      setStatus('streaming')

      const historyForRequest = trimForRequest([...messages, userMessage])

      let liveContent = ''
      const liveId = `streaming-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: liveId, conversationId: conversation.id, role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true },
      ])

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathname, messages: historyForRequest }),
        })

        if (!res.ok || !res.body) {
          throw new Error('The assistant could not respond right now.')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finalModel: string | undefined

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''

          for (const chunk of chunks) {
            const eventLine = chunk.split('\n').find((l) => l.startsWith('event:'))
            const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'))
            if (!eventLine || !dataLine) continue

            const eventName = eventLine.slice(6).trim()
            const data = JSON.parse(dataLine.slice(5).trim())

            if (eventName === 'delta') {
              liveContent += data.delta
              setMessages((prev) => prev.map((m) => (m.id === liveId ? { ...m, content: liveContent } : m)))
            } else if (eventName === 'tool-start') {
              setActiveToolName(data.name)
            } else if (eventName === 'tool-end') {
              setActiveToolName(null)
            } else if (eventName === 'error') {
              throw new Error(data.message)
            } else if (eventName === 'done') {
              finalModel = data.model
              liveContent = data.content || liveContent
            }
          }
        }

        // Defense in depth: even with the orchestrator's own fallback
        // synthesis call, never let an empty bubble reach the user or get
        // persisted — treat it as a retryable error instead of silence.
        if (!liveContent.trim()) {
          throw new Error("I couldn't come up with an answer to that. Please try again.")
        }

        const savedAssistant = await repo.appendMessage(conversation.id, {
          role: 'assistant',
          content: liveContent,
          model: finalModel ?? null,
        })
        setMessages((prev) => prev.map((m) => (m.id === liveId ? savedAssistant : m)))
        setStatus('idle')
      } catch (err) {
        setStatus('error')
        setActiveToolName(null)
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.')
        setMessages((prev) => prev.filter((m) => m.id !== liveId))
      }
    },
    [ensureConversation, messages, pathname, status],
  )

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) send(lastUser.content)
  }, [messages, send])

  return { status, messages, errorMessage, activeToolName, send, retryLast }
}
