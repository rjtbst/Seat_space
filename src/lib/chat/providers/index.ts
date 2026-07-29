// src/lib/chat/providers/index.ts
//
// The ONLY place that decides which ChatProvider implementation to use.
// Everything else (orchestrator, api route) depends only on the
// ChatProvider interface from ./types.

import type { ChatProvider } from './types'
import { QwenProvider } from './qwen.provider'

export type { ChatProvider, ProviderMessage, ProviderStreamEvent, ProviderToolCall, ProviderToolSpec } from './types'

let cached: ChatProvider | null = null

export function getChatProvider(): ChatProvider {
  if (cached) return cached

  // Qwen via OpenRouter is the only provider now — Groq/Grok/Gemini were
  // tried and removed (didn't perform as needed for this use case).
  // OpenRouter is OpenAI-compatible, so it reuses OpenAICompatibleProvider
  // like the removed providers did.
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set — required for the chat provider')
  cached = new QwenProvider(apiKey)
  return cached
}
