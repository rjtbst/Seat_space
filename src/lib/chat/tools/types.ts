// src/lib/chat/tools/types.ts
//
// A "tool" here is always a thin, read-only wrapper around an existing
// server action or repository function — never a new raw query, and never
// something that mutates data. See registry.ts for how these get filtered
// per role and public.tools.ts / student.tools.ts / owner.tools.ts /
// staff.tools.ts for the concrete definitions.

import type { Enums } from '@/lib/supabase/types'

export type ChatRole = Enums<'user_role'> | 'guest'

export type ToolExecutionContext = {
  role: ChatRole
  userId: string | null
  /** Resolved server-side (e.g. from staff/owner membership) — never trusted from the LLM's arguments. */
  libraryId: string | null
}

export type ToolDefinition<TArgs = any> = {
  name: string
  description: string
  /** JSON Schema object describing TArgs — sent to the provider as the function's parameters. */
  parameters: Record<string, unknown>
  /** Which roles get this tool offered at all. Enforced again inside the handler, not just at listing time. */
  roles: ChatRole[]
  handler: (args: TArgs, ctx: ToolExecutionContext) => Promise<unknown>
}
