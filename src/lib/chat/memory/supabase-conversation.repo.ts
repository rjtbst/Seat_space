// src/lib/chat/memory/supabase-conversation.repo.ts
//
// Supabase-backed implementation of ConversationRepository, for logged-in
// users. All actual reads/writes happen server-side (RLS + auth.uid()
// scoping) — this class just adapts those server actions to the interface
// useChat() expects, throwing on failure so the caller can show an error
// state consistently.

'use client'

import {
  appendMessageAction,
  archiveConversationAction,
  createConversationAction,
  getActiveConversationAction,
  listMessagesAction,
  renameConversationAction,
} from '@/lib/actions/chat/conversations'
import type {
  ChatContextSnapshot,
  ChatConversation,
  ChatMessage,
  ConversationRepository,
} from './types'

function unwrap<T>(result: { success: boolean; data?: T; error?: string }): T {
  if (!result.success) throw new Error(result.error ?? 'Chat storage request failed')
  return result.data as T
}

export class SupabaseConversationRepository implements ConversationRepository {
  async getActiveConversation(): Promise<ChatConversation | null> {
    return unwrap(await getActiveConversationAction())
  }

  async createConversation(context: ChatContextSnapshot): Promise<ChatConversation> {
    return unwrap(await createConversationAction(context))
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    return unwrap(await listMessagesAction(conversationId))
  }

  async appendMessage(
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'>,
  ): Promise<ChatMessage> {
    return unwrap(
      await appendMessageAction(conversationId, {
        role: message.role,
        content: message.content,
        toolName: message.toolName,
        toolArgs: message.toolArgs ?? undefined,
        toolResult: message.toolResult ?? undefined,
        model: message.model,
      }),
    )
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    unwrap(await renameConversationAction(conversationId, title))
  }

  async archiveConversation(conversationId: string): Promise<void> {
    unwrap(await archiveConversationAction(conversationId))
  }
}
