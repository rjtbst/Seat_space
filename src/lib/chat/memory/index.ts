// src/lib/chat/memory/index.ts
//
// Single entry point the UI uses to get a ConversationRepository. Nothing
// else in components/chat should import guest-conversation.repo.ts or
// supabase-conversation.repo.ts directly — that's what keeps the swap
// invisible to useChat().

'use client'

import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { GuestConversationRepository } from './guest-conversation.repo'
import { SupabaseConversationRepository } from './supabase-conversation.repo'
import type { ConversationRepository } from './types'

export type { ConversationRepository, ChatConversation, ChatMessage, ChatContextSnapshot, ChatRole } from './types'
export { getGuestSessionId, clearGuestChatStorage } from './guest-conversation.repo'

/**
 * Resolves which repository to use for the current visitor. Cheap client-side
 * auth check (mirrors the pattern useNotifications() already uses) — this is
 * only for picking a storage backend, never for authorization. Every write
 * this repository makes is re-validated server-side regardless.
 */
export async function getConversationRepository(): Promise<{
  repository: ConversationRepository
  isGuest: boolean
}> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return { repository: new SupabaseConversationRepository(), isGuest: false }
  }
  return { repository: new GuestConversationRepository(), isGuest: true }
}
