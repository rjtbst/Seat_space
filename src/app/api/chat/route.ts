// src/app/api/chat/route.ts
//
// Thin by design: resolve context (auth-derived, not client-claimed) ->
// build the system prompt -> run the orchestrator -> stream Server-Sent
// Events back. No DB writes happen here — the client persists the turn
// afterwards via lib/chat/memory, using the same repository interface for
// guests and authenticated users.

import { NextRequest } from 'next/server'
import { buildChatContext } from '@/lib/chat/context/buildContext'
import { buildSystemPrompt } from '@/lib/chat/prompt/systemPrompt'
import { runChatTurn } from '@/lib/chat/orchestrator'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getSupabaseUser } from '@/lib/supabase/server'
import { logError } from '@/lib/logger'
import type { ProviderMessage } from '@/lib/chat/providers/types'

export const runtime = 'nodejs'

type ChatRequestBody = {
  pathname: string
  bookingId?: string | null
  /** Trimmed conversation history — user/assistant turns only. The client owns trimming (see lib/chat/memory/trim.ts). */
  messages: { role: 'user' | 'assistant'; content: string }[]
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  if (!body?.messages?.length || typeof body.pathname !== 'string') {
    return new Response(JSON.stringify({ error: 'messages and pathname are required' }), { status: 400 })
  }

  // Rate-limit per identity: authenticated users by user id, guests by IP —
  // reuses the same Postgres-backed limiter the rest of the app uses.
  const { supabase, user } = await getSupabaseUser()
  const rateLimitKey = user ? `chat:user:${user.id}` : `chat:ip:${req.headers.get('x-forwarded-for') ?? 'unknown'}`
  const rl = await checkRateLimit(
    supabase,
    rateLimitKey,
    user ? RATE_LIMITS.CHAT_MESSAGE_PER_USER : RATE_LIMITS.CHAT_MESSAGE_PER_IP,
  )
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: rl.message }), { status: 429 })
  }

  const ctx = await buildChatContext({ pathname: body.pathname, bookingId: body.bookingId })
  const systemPrompt = buildSystemPrompt(ctx)

  const providerMessages: ProviderMessage[] = body.messages
    .slice(-20) // hard ceiling even if the client sends more than expected
    .map((m) => ({ role: m.role, content: m.content }))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const evt of runChatTurn({ systemPrompt, messages: providerMessages, toolContext: ctx.toolContext })) {
          if (evt.type === 'delta') {
            send('delta', { delta: evt.delta })
          } else if (evt.type === 'tool-start') {
            send('tool-start', { name: evt.name })
          } else if (evt.type === 'tool-end') {
            send('tool-end', { name: evt.name, ok: evt.ok })
          } else if (evt.type === 'error') {
            send('error', { message: evt.message })
          } else if (evt.type === 'done') {
            send('done', { content: evt.content, model: evt.model })
          }
        }
      } catch (err) {
        logError('POST /api/chat', 'Stream failed', err)
        send('error', { message: 'Something went wrong. Please try again.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
