// src/lib/chat/memory/trim.ts
//
// Deliberately simple sliding-window trim, per the spec ("do not build an
// overcomplicated long-term memory system yet"). Keeps the most recent N
// turns; if there's more history than that, prepends a short synthetic
// system-style note so the model at least knows earlier context existed
// (without paying to re-send it every turn).
//
// MAX_TURNS_SENT is deliberately small (6, not 16) because every turn's
// tokens get re-sent on EVERY subsequent request — there's no server-side
// session state with the provider. On a free-tier TPM budget (6K-12K on
// Groq's free models), history is usually the biggest lever you have:
// system prompt + tool schemas are close to fixed per request, but history
// grows unboundedly if you let it. Raise this only if you've moved to a
// tier/provider with real TPM headroom.

import type { ChatMessage } from './types'

const MAX_TURNS_SENT = 6

export function trimForRequest(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const conversational = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  const recent = conversational.slice(-MAX_TURNS_SENT)

  return recent.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}
