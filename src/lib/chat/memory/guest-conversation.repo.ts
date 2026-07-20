// src/lib/chat/memory/guest-conversation.repo.ts
//
// localStorage-backed implementation of ConversationRepository, used for
// anyone not logged in. Same interface as the Supabase-backed repository
// (supabase-conversation.repo.ts) so useChat() can't tell the difference.
//
// Storage shape is intentionally simple: one conversation per guest browser
// at a time (matches "keep recent context during the session" from the
// spec — guests don't get a conversation list, just continuity).

'use client'

import type {
  ChatConversation,
  ChatContextSnapshot,
  ChatMessage,
  ConversationRepository,
} from './types'

const GUEST_SESSION_KEY = 'ls_chat_guest_id'
const GUEST_CONVERSATION_KEY = 'ls_chat_guest_conversation'
const GUEST_MESSAGES_KEY = 'ls_chat_guest_messages'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback for older browsers — not cryptographically strong, fine for a
  // local, non-sensitive session identifier.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Stable per-browser guest session id — the anchor used when migrating into Supabase after login. */
export function getGuestSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = window.localStorage.getItem(GUEST_SESSION_KEY)
  if (!id) {
    id = uuid()
    window.localStorage.setItem(GUEST_SESSION_KEY, id)
  }
  return id
}

export function clearGuestChatStorage() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(GUEST_CONVERSATION_KEY)
  window.localStorage.removeItem(GUEST_MESSAGES_KEY)
  // Deliberately keep GUEST_SESSION_KEY around — harmless once messages are
  // migrated, and re-generating it on every login would break de-dup if a
  // migration is retried.
}

function readConversation(): ChatConversation | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(GUEST_CONVERSATION_KEY)
  return raw ? (JSON.parse(raw) as ChatConversation) : null
}

function readMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(GUEST_MESSAGES_KEY)
  return raw ? (JSON.parse(raw) as ChatMessage[]) : []
}

function writeMessages(messages: ChatMessage[]) {
  window.localStorage.setItem(GUEST_MESSAGES_KEY, JSON.stringify(messages))
}

export class GuestConversationRepository implements ConversationRepository {
  async getActiveConversation(): Promise<ChatConversation | null> {
    return readConversation()
  }

  async createConversation(context: ChatContextSnapshot): Promise<ChatConversation> {
    const conversation: ChatConversation = {
      id: uuid(),
      ownerType: 'guest',
      title: null,
      contextSnapshot: context,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(GUEST_CONVERSATION_KEY, JSON.stringify(conversation))
    writeMessages([])
    return conversation
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    return readMessages().filter((m) => m.conversationId === conversationId)
  }

  async appendMessage(
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'>,
  ): Promise<ChatMessage> {
    const full: ChatMessage = {
      ...message,
      id: uuid(),
      conversationId,
      createdAt: new Date().toISOString(),
    }
    const messages = readMessages()
    messages.push(full)
    writeMessages(messages)

    const conv = readConversation()
    if (conv && conv.id === conversationId) {
      conv.updatedAt = full.createdAt
      window.localStorage.setItem(GUEST_CONVERSATION_KEY, JSON.stringify(conv))
    }
    return full
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const conv = readConversation()
    if (conv && conv.id === conversationId) {
      conv.title = title
      window.localStorage.setItem(GUEST_CONVERSATION_KEY, JSON.stringify(conv))
    }
  }

  async archiveConversation(): Promise<void> {
    // Guests don't get a conversation list to archive from — a fresh visit
    // simply starts a new local thread. No-op kept for interface parity.
    clearGuestChatStorage()
  }
}
