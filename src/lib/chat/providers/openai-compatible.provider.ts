// src/lib/chat/providers/openai-compatible.provider.ts
//
// xAI (Grok), Groq, and OpenAI itself all expose the same
// POST /v1/chat/completions shape with stream: true giving the same SSE
// chunk format, including streamed tool_calls. Rather than duplicate the
// fetch + SSE-parsing + tool-call-accumulation logic per provider, that
// logic lives here once; grok.provider.ts / groq.provider.ts are just
// {apiUrl, apiKey, model} config wrappers around this class.
//
// If a future provider's wire format genuinely diverges (Claude, Gemini,
// Ollama's native API), it gets its own ChatProvider implementation instead
// of forcing itself into this shape — this base class is a convenience for
// the OpenAI-compatible family specifically, not a universal abstraction.

import type {
  ChatProvider,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolCall,
  ProviderToolSpec,
} from './types'

function toOpenAIMessages(systemPrompt: string, messages: ProviderMessage[]) {
  const out: any[] = [{ role: 'system', content: systemPrompt }]
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
      continue
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      })
      continue
    }
    out.push({ role: m.role, content: m.content })
  }
  return out
}

function toOpenAITools(tools: ProviderToolSpec[]) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

export abstract class OpenAICompatibleProvider implements ChatProvider {
  readonly modelLabel: string

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    model: string,
    /** Extra request-body fields a specific provider needs, e.g. Groq's `service_tier`. */
    private readonly extraBody: Record<string, unknown> = {},
  ) {
    this.modelLabel = model
  }

  async *streamCompletion(input: {
    systemPrompt: string
    messages: ProviderMessage[]
    tools: ProviderToolSpec[]
  }): AsyncGenerator<ProviderStreamEvent> {
    const body = {
      model: this.modelLabel,
      messages: toOpenAIMessages(input.systemPrompt, input.messages),
      tools: input.tools.length ? toOpenAITools(input.tools) : undefined,
      stream: true,
      temperature: 0.4,
      ...this.extraBody,
    }

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      const err = new Error(`Chat provider error (${res.status}): ${text.slice(0, 300)}`) as Error & { status?: number }
      err.status = res.status
      throw err
    }

    // Accumulate streamed tool_calls by their array index — OpenAI-style
    // streaming sends the function name and arguments in fragments across
    // multiple chunks, keyed by index rather than id on every chunk.
    const toolCallAcc = new Map<number, { id: string; name: string; args: string }>()
    let finishReason: 'stop' | 'tool_calls' | 'length' | 'error' = 'stop'

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue

        let chunk: any
        try {
          chunk = JSON.parse(payload)
        } catch {
          continue
        }

        const choice = chunk.choices?.[0]
        if (!choice) continue

        if (choice.delta?.content) {
          yield { type: 'text-delta', delta: choice.delta.content }
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0
            const existing = toolCallAcc.get(idx) ?? { id: tc.id ?? '', name: '', args: '' }
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name += tc.function.name
            if (tc.function?.arguments) existing.args += tc.function.arguments
            toolCallAcc.set(idx, existing)
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason
        }
      }
    }

    if (finishReason === 'tool_calls') {
      for (const [, acc] of toolCallAcc) {
        let args: Record<string, unknown> = {}
        try {
          args = acc.args ? JSON.parse(acc.args) : {}
        } catch {
          args = {}
        }
        const toolCall: ProviderToolCall = { id: acc.id, name: acc.name, args }
        yield { type: 'tool-call', toolCall }
      }
    }

    yield { type: 'done', finishReason }
  }
}
