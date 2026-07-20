// src/lib/chat/memory/types.ts
//
// Canonical shapes for the chat feature's persisted data, plus the
// repository contract. The UI (useChat) only ever talks to
// ConversationRepository — it never knows whether messages are coming from
// localStorage (guest) or Supabase (authenticated user). See memory/index.ts
// for the factory that picks the implementation.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessage = {
  id: string
  conversationId: string
  role: ChatRole
  content: string
  toolName?: string | null
  toolArgs?: Record<string, unknown> | null
  toolResult?: unknown | null
  model?: string | null
  createdAt: string
}

export type ChatContextSnapshot = {
  route: string
  role: 'guest' | 'student' | 'owner' | 'staff' | 'admin'
  libraryId?: string | null
  bookingId?: string | null
}

export type ChatConversation = {
  id: string
  ownerType: 'user' | 'guest'
  title: string | null
  contextSnapshot: ChatContextSnapshot | null
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

/**
 * One repository interface, two implementations (guest / authenticated).
 * Keeping this narrow on purpose — it's a transcript store, not a general
 * query API. Anything role/permission-aware belongs in the tool layer, not
 * here.
 */
export interface ConversationRepository {
  /** Most recent non-archived conversation, or null if none exists yet. */
  getActiveConversation(): Promise<ChatConversation | null>
  createConversation(context: ChatContextSnapshot): Promise<ChatConversation>
  listMessages(conversationId: string): Promise<ChatMessage[]>
  appendMessage(
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'>,
  ): Promise<ChatMessage>
  renameConversation(conversationId: string, title: string): Promise<void>
  archiveConversation(conversationId: string): Promise<void>
}
