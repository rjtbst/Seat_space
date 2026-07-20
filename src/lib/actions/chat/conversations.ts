'use server'

// src/lib/actions/chat/conversations.ts
//
// Server actions backing the Supabase-persisted side of the chat memory
// layer (see lib/chat/memory/supabase-conversation.repo.ts, which is the
// thin client-side wrapper that calls these). RLS on chat_conversations /
// chat_messages already scopes everything to auth.uid(), but we also check
// the session here so an unauthenticated caller gets a clean error instead
// of an empty-looking success.

import { getSupabaseUser } from '@/lib/supabase/server'
import { logError } from '@/lib/logger'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import type { ChatContextSnapshot, ChatConversation, ChatMessage, ChatRole } from '@/lib/chat/memory/types'

function mapConversation(row: any): ChatConversation {
  return {
    id: row.id,
    ownerType: row.owner_type,
    title: row.title,
    contextSnapshot: row.context_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  }
}

function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ChatRole,
    content: row.content,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    toolResult: row.tool_result,
    model: row.model,
    createdAt: row.created_at,
  }
}

export async function getActiveConversationAction(): Promise<ActionResult<ChatConversation | null>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logError('getActiveConversationAction', 'Fetch failed', error)
    return { success: false, error: 'Could not load conversation' }
  }
  return { success: true, data: data ? mapConversation(data) : null }
}

export async function createConversationAction(
  context: ChatContextSnapshot,
): Promise<ActionResult<ChatConversation>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: user.id, owner_type: 'user', context_snapshot: context as never })
    .select('*')
    .single()

  if (error || !data) {
    logError('createConversationAction', 'Insert failed', error)
    return { success: false, error: 'Could not start conversation' }
  }
  return { success: true, data: mapConversation(data) }
}

export async function listMessagesAction(conversationId: string): Promise<ActionResult<ChatMessage[]>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    logError('listMessagesAction', 'Fetch failed', error)
    return { success: false, error: 'Could not load messages' }
  }
  return { success: true, data: (data ?? []).map(mapMessage) }
}

export async function appendMessageAction(
  conversationId: string,
  message: { role: ChatRole; content: string; toolName?: string | null; toolArgs?: unknown; toolResult?: unknown; model?: string | null },
): Promise<ActionResult<ChatMessage>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      tool_name: message.toolName ?? null,
      tool_args: (message.toolArgs ?? null) as never,
      tool_result: (message.toolResult ?? null) as never,
      model: message.model ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    logError('appendMessageAction', 'Insert failed', error)
    return { success: false, error: 'Could not save message' }
  }
  return { success: true, data: mapMessage(data) }
}

export async function renameConversationAction(conversationId: string, title: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('chat_conversations')
    .update({ title })
    .eq('id', conversationId)
    .eq('user_id', user.id)

  if (error) {
    logError('renameConversationAction', 'Update failed', error)
    return { success: false, error: 'Could not rename conversation' }
  }
  return { success: true, data: undefined }
}

export async function archiveConversationAction(conversationId: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('chat_conversations')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', user.id)

  if (error) {
    logError('archiveConversationAction', 'Update failed', error)
    return { success: false, error: 'Could not archive conversation' }
  }
  return { success: true, data: undefined }
}

/**
 * Bulk-migrates a guest's localStorage thread into Supabase right after
 * login. Called once from migrateGuestToUser() with the guest's in-memory
 * messages — never reads guest_session_id off a client-supplied value for
 * anything privileged, since the conversation it creates is immediately
 * owned by the now-authenticated user.id.
 */
export async function migrateGuestConversationAction(
  context: ChatContextSnapshot,
  messages: { role: ChatRole; content: string; createdAt: string }[],
): Promise<ActionResult<ChatConversation>> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  if (!messages.length) return { success: false, error: 'Nothing to migrate' }

  const { data: conversation, error: convErr } = await supabase
    .from('chat_conversations')
    .insert({ user_id: user.id, owner_type: 'user', context_snapshot: context as never })
    .select('*')
    .single()

  if (convErr || !conversation) {
    logError('migrateGuestConversationAction', 'Insert conversation failed', convErr)
    return { success: false, error: 'Could not migrate conversation' }
  }

  const rows = messages.map((m) => ({
    conversation_id: conversation.id,
    role: m.role,
    content: m.content,
    created_at: m.createdAt,
  }))

  const { error: msgErr } = await supabase.from('chat_messages').insert(rows as never[])
  if (msgErr) {
    logError('migrateGuestConversationAction', 'Insert messages failed', msgErr)
    // Conversation exists but empty — not fatal, still return it.
  }

  return { success: true, data: mapConversation(conversation) }
}
