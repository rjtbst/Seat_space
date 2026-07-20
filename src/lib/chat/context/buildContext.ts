// src/lib/chat/context/buildContext.ts
//
// Builds the minimal context object sent to both the prompt builder and the
// tool execution layer. Role and identity ALWAYS come from the server-side
// session — the client only ever supplies non-privileged UI breadcrumbs
// (current pathname, and a bookingId if the student is looking at a
// specific booking page). If the client's claimed role doesn't match what
// the DB says, the DB wins.

import { getSupabaseUser } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/guards'
import { getFirstLibraryId } from '@/lib/actions/owner'
import { getStaffLibrary } from '@/lib/actions/staff'
import type { ChatContextSnapshot } from '@/lib/chat/memory/types'
import type { ChatRole, ToolExecutionContext } from '@/lib/chat/tools/types'

export type ChatRequestContext = {
  role: ChatRole
  userId: string | null
  toolContext: ToolExecutionContext
  snapshot: ChatContextSnapshot
}

export async function buildChatContext(clientHints: {
  pathname: string
  bookingId?: string | null
}): Promise<ChatRequestContext> {
  const { user } = await getSupabaseUser()

  if (!user) {
    return {
      role: 'guest',
      userId: null,
      toolContext: { role: 'guest', userId: null, libraryId: null },
      snapshot: { route: clientHints.pathname, role: 'guest' },
    }
  }

  const { profile } = await getProfile()
  const role = (profile?.role ?? 'student') as ChatRole

  let libraryId: string | null = null
  if (role === 'owner') {
    libraryId = await getFirstLibraryId()
  } else if (role === 'staff') {
    const staffLib = await getStaffLibrary()
    libraryId = staffLib?.libraryId ?? null
  }

  return {
    role,
    userId: user.id,
    toolContext: { role, userId: user.id, libraryId },
    snapshot: {
      route: clientHints.pathname,
      role: role as ChatContextSnapshot['role'],
      libraryId,
      bookingId: clientHints.bookingId ?? null,
    },
  }
}
