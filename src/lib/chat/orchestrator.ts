// src/lib/chat/orchestrator.ts
//
// Ties provider + tools + prompt together for a single chat turn. Does NOT
// touch chat_conversations/chat_messages — persistence is the client's job
// via lib/chat/memory (both the guest and Supabase repositories implement
// the same interface, so this file doesn't need to care which one is in
// play). Keeping this separation means the orchestrator is equally usable
// from a Route Handler, a script, or a future non-chat surface.

import { getChatProvider } from '@/lib/chat/providers'
import type { ProviderMessage, ProviderToolCall } from '@/lib/chat/providers/types'
import { getToolForRole, getToolSpecsForRole } from '@/lib/chat/tools/registry'
import type { ToolExecutionContext } from '@/lib/chat/tools/types'
import { logError, logWarn } from '@/lib/logger'

function friendlyProviderErrorMessage(err: unknown): string {
  const status = (err as { status?: number } | undefined)?.status
  if (status === 429) {
    return "We're getting a lot of questions right now and hit a temporary limit. Please wait about a minute and try again."
  }
  if (status && status >= 500) {
    return "The assistant's AI service is having issues right now. Please try again in a moment."
  }
  return 'The assistant is temporarily unavailable. Please try again.'
}

export type OrchestratorEvent =
  | { type: 'delta'; delta: string }
  | { type: 'tool-start'; name: string }
  | { type: 'tool-end'; name: string; ok: boolean }
  | { type: 'done'; content: string; model: string; toolCalls: { name: string; args: unknown; result: unknown }[] }
  | { type: 'error'; message: string }

// Each round below re-sends the ENTIRE system prompt + tool schemas +
// message history to the provider — there's no server-side session, so a
// multi-round tool-calling turn costs roughly Nx a single-shot turn in
// tokens. Kept modest for free-tier TPM budgets, but paired with a
// guaranteed final synthesis call below — hitting this limit must never
// silently produce an empty reply (see the round-exhaustion handling after
// the loop).
const MAX_TOOL_ROUNDS = 3

const FALLBACK_REPLY =
  "I couldn't put together a full answer to that just now. Could you try rephrasing, or ask one thing at a time? If this keeps happening, please contact support."

export async function* runChatTurn(input: {
  systemPrompt: string
  messages: ProviderMessage[]
  toolContext: ToolExecutionContext
}): AsyncGenerator<OrchestratorEvent> {
  const provider = getChatProvider()
  const tools = getToolSpecsForRole(input.toolContext.role)
  const messages = [...input.messages]
  const toolCallLog: { name: string; args: unknown; result: unknown }[] = []

  let finalText = ''
  let roundsExhaustedMidToolCall = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let roundText = ''
    const pendingToolCalls: ProviderToolCall[] = []
    let finishReason: 'stop' | 'tool_calls' | 'length' | 'error' = 'stop'

    try {
      for await (const event of provider.streamCompletion({
        systemPrompt: input.systemPrompt,
        messages,
        tools,
      })) {
        if (event.type === 'text-delta') {
          roundText += event.delta
          yield { type: 'delta', delta: event.delta }
        } else if (event.type === 'tool-call') {
          pendingToolCalls.push(event.toolCall)
        } else if (event.type === 'done') {
          finishReason = event.finishReason
        }
      }
    } catch (err) {
      logError('runChatTurn', 'Provider stream failed', err)
      yield { type: 'error', message: friendlyProviderErrorMessage(err) }
      return
    }

    finalText += roundText

    if (finishReason !== 'tool_calls' || !pendingToolCalls.length) {
      break
    }

    // Record the assistant's tool-call turn, then execute each tool and
    // append its result as a role: 'tool' message before looping back for
    // the model's follow-up response.
    messages.push({ role: 'assistant', content: roundText, toolCalls: pendingToolCalls })

    for (const call of pendingToolCalls) {
      yield { type: 'tool-start', name: call.name }
      const tool = getToolForRole(call.name, input.toolContext.role)

      let resultPayload: unknown
      if (!tool) {
        logWarn('runChatTurn', 'Tool not available for role', { name: call.name, role: input.toolContext.role })
        resultPayload = { error: `Tool "${call.name}" is not available.` }
      } else {
        try {
          resultPayload = await tool.handler(call.args, input.toolContext)
        } catch (err) {
          logError('runChatTurn', `Tool "${call.name}" execution failed`, err)
          resultPayload = { error: 'This tool failed to execute. Tell the user you could not fetch that right now.' }
        }
      }

      toolCallLog.push({ name: call.name, args: call.args, result: resultPayload })
      yield { type: 'tool-end', name: call.name, ok: !(resultPayload as any)?.error }

      messages.push({
        role: 'tool',
        name: call.name,
        toolCallId: call.id,
        content: JSON.stringify(resultPayload).slice(0, 1500), // guard against a runaway payload bloating context
      })
    }

    // If this was the last allowed round, we now have fresh tool results
    // sitting in `messages` that the model never got to read back — that's
    // exactly the bug that used to produce a silent empty reply. Flag it so
    // we force one more, tools-disabled call below instead of just exiting.
    if (round === MAX_TOOL_ROUNDS - 1) {
      roundsExhaustedMidToolCall = true
    }
    // loop continues — next round sends the tool results back to the model
  }

  if (roundsExhaustedMidToolCall || !finalText.trim()) {
    try {
      let synthesis = ''
      for await (const event of provider.streamCompletion({
        systemPrompt:
          input.systemPrompt +
          '\n\nYou have already gathered the data you need (see the tool results above in the conversation). Answer the user\'s question now, in plain text — do not call any more tools.',
        messages,
        tools: [], // force a text-only finish — this is the guaranteed-answer safety net
      })) {
        if (event.type === 'text-delta') {
          synthesis += event.delta
          yield { type: 'delta', delta: event.delta }
        }
      }
      finalText = (finalText + synthesis).trim() || FALLBACK_REPLY
      if (!synthesis && !finalText) {
        yield { type: 'delta', delta: FALLBACK_REPLY }
        finalText = FALLBACK_REPLY
      }
    } catch (err) {
      logError('runChatTurn', 'Fallback synthesis call failed', err)
      finalText = finalText.trim() || FALLBACK_REPLY
      if (finalText === FALLBACK_REPLY) yield { type: 'delta', delta: FALLBACK_REPLY }
    }
  }

  yield { type: 'done', content: finalText, model: provider.modelLabel, toolCalls: toolCallLog }
}
