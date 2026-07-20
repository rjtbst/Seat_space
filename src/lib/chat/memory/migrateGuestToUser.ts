// src/lib/chat/memory/migrateGuestToUser.ts
//
// Call this once, right after a successful login, if a guest chat thread
// exists in localStorage. It's intentionally NOT automatic on every
// getConversationRepository() call — login flows are the only place that
// knows "we just transitioned from guest to authenticated", so they're the
// right place to trigger a one-time migration.

'use client'

import { migrateGuestConversationAction } from '@/lib/actions/chat/conversations'
import { GuestConversationRepository, clearGuestChatStorage } from './guest-conversation.repo'
import type { ChatContextSnapshot } from './types'

export async function migrateGuestToUser(currentContext: ChatContextSnapshot): Promise<boolean> {
  const guestRepo = new GuestConversationRepository()
  const conversation = await guestRepo.getActiveConversation()
  if (!conversation) return false

  const messages = await guestRepo.listMessages(conversation.id)
  // Tool-call rows don't make sense to replay under a different identity —
  // only carry over the human-readable turns.
  const portable = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt }))

  if (!portable.length) {
    clearGuestChatStorage()
    return false
  }

  const result = await migrateGuestConversationAction(
    conversation.contextSnapshot ?? currentContext,
    portable,
  )

  if (result.success) {
    clearGuestChatStorage()
    return true
  }
  return false
}
