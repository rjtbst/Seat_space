// src/lib/chat/providers/grok.provider.ts
//
// xAI Grok — config wrapper around OpenAICompatibleProvider (see that file
// for the actual fetch/streaming/tool-call logic).
//
// Required env vars:
//   XAI_API_KEY   — server-side only, never exposed to the client
//   GROK_MODEL    — defaults to 'grok-2-latest' if unset

import { OpenAICompatibleProvider } from './openai-compatible.provider'

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'

export class GrokProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model?: string) {
    super(GROK_API_URL, apiKey, model || process.env.GROK_MODEL || 'grok-2-latest')
  }
}
