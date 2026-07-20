// src/lib/chat/providers/groq.provider.ts
//
// Groq's API is also OpenAI-compatible — config wrapper around
// OpenAICompatibleProvider, same as Grok. Groq's free tier is generous
// (rate-limited, not usage-metered like xAI/OpenAI), which is why this is
// the default CHAT_PROVIDER — see providers/index.ts.
//
// Required env vars:
//   GROQ_API_KEY   — server-side only, never exposed to the client
//   GROQ_MODEL     — defaults to 'llama-3.3-70b-versatile' if unset
//                    (a Groq-hosted model that supports tool/function calling —
//                    check https://console.groq.com/docs/models before
//                    switching, not every hosted model does)

import { OpenAICompatibleProvider } from './openai-compatible.provider'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model?: string) {
    super(GROQ_API_URL, apiKey, model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile')
  }
}
