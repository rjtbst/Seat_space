// src/lib/chat/providers/qwen.provider.ts
//
// Qwen via OpenRouter — config wrapper around OpenAICompatibleProvider (see
// that file for the actual fetch/streaming/tool-call logic). OpenRouter
// exposes the same POST /v1/chat/completions wire format as Groq/Grok/OpenAI,
// so no new streaming logic was needed — only this wrapper.
//
// Required env vars:
//   OPENROUTER_API_KEY   — server-side only, never exposed to the client
//   OPENROUTER_MODEL     — defaults to 'qwen/qwen-2.5-72b-instruct' if unset
//                          (check https://openrouter.ai/models?q=qwen for the
//                          current list — pick a variant that supports
//                          tool/function calling, not every Qwen model on
//                          OpenRouter does)

import { OpenAICompatibleProvider } from './openai-compatible.provider'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export class QwenProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model?: string) {
    super(OPENROUTER_API_URL, apiKey, model || process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct')
  }
}
