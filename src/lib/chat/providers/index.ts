// src/lib/chat/providers/index.ts
//
// The ONLY place that decides which ChatProvider implementation to use.
// Everything else (orchestrator, api route) depends only on the
// ChatProvider interface from ./types. Switching providers — or supporting
// several at once (e.g. per-library override) — only ever means editing
// this file.

import type { ChatProvider } from './types'
import { GroqProvider } from './groq.provider'
import { GrokProvider } from './grok.provider'
import { GeminiProvider } from './gemini.provider'

export type { ChatProvider, ProviderMessage, ProviderStreamEvent, ProviderToolCall, ProviderToolSpec } from './types'

let cached: ChatProvider | null = null

export function getChatProvider(): ChatProvider {
  if (cached) return cached

  // Groq is the default: free-tier-friendly (rate-limited, not
  // usage-metered), same OpenAI-compatible wire format as Grok/Gemini.
  // Switch via CHAT_PROVIDER — e.g. CHAT_PROVIDER=gemini for noticeably
  // better tool-calling/instruction-following accuracy, still free (see
  // gemini.provider.ts for the free-tier data-use note before going live
  // with real customers).
  const kind = (process.env.CHAT_PROVIDER || 'groq').toLowerCase()

  switch (kind) {
    case 'groq': {
      const apiKey = process.env.GROQ_API_KEY
      if (!apiKey) throw new Error('GROQ_API_KEY is not set — required for CHAT_PROVIDER=groq')
      cached = new GroqProvider(apiKey)
      return cached
    }
    case 'grok': {
      const apiKey = process.env.XAI_API_KEY
      if (!apiKey) throw new Error('XAI_API_KEY is not set — required for CHAT_PROVIDER=grok')
      cached = new GrokProvider(apiKey)
      return cached
    }
    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set — required for CHAT_PROVIDER=gemini')
      cached = new GeminiProvider(apiKey)
      return cached
    }
    // Future providers plug in here, each behind the same ChatProvider
    // contract — e.g.:
    // case 'openai':  cached = new OpenAIProvider(process.env.OPENAI_API_KEY!); break
    // case 'claude':  cached = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!); break
    // case 'ollama':  cached = new OllamaProvider(process.env.OLLAMA_BASE_URL!); break
    default:
      throw new Error(`Unknown CHAT_PROVIDER "${kind}"`)
  }
}