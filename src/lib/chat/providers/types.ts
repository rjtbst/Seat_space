// src/lib/chat/providers/types.ts
//
// The one contract every provider implementation (Qwen/OpenRouter now;
// OpenAI, Claude, Ollama later) must satisfy. Nothing outside providers/ should
// import a provider-specific SDK or know provider-specific request/response
// shapes — that's the entire point of this file existing.

export type ProviderRole = 'system' | 'user' | 'assistant' | 'tool'

export type ProviderMessage = {
  role: ProviderRole
  content: string
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: ProviderToolCall[]
  /** Present on role: 'tool' messages — must reference a prior toolCall id. */
  toolCallId?: string
  /** Present on role: 'tool' messages — the tool's name, for readability. */
  name?: string
}

export type ProviderToolCall = {
  id: string
  name: string
  /** Already-parsed arguments — providers are responsible for JSON.parse-ing their own wire format. */
  args: Record<string, unknown>
}

/** JSON-schema-ish tool definition, deliberately provider-agnostic (no OpenAI/xAI-specific wrapper here). */
export type ProviderToolSpec = {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema object
}

export type ProviderStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCall: ProviderToolCall }
  | { type: 'done'; finishReason: 'stop' | 'tool_calls' | 'length' | 'error' }

export interface ChatProvider {
  /** Human-readable label stored on chat_messages.model, e.g. 'grok-2-latest'. */
  readonly modelLabel: string

  /**
   * Streams a single completion turn. If the model wants to call tools,
   * the stream ends with a 'done' event whose finishReason is 'tool_calls'
   * and any 'tool-call' events emitted along the way describe what to run —
   * the orchestrator is responsible for executing them and making a follow-up
   * call with the results appended as role: 'tool' messages.
   */
  streamCompletion(input: {
    systemPrompt: string
    messages: ProviderMessage[]
    tools: ProviderToolSpec[]
  }): AsyncGenerator<ProviderStreamEvent>
}
