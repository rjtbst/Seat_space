// src/lib/chat/tools/registry.ts
//
// Central registry. Adding a new tool later means: write the handler in the
// right *.tools.ts file, add it to the array below. Nothing in the
// orchestrator, api route, or provider layer needs to change.

import type { ProviderToolSpec } from '@/lib/chat/providers/types'
import { publicTools } from './public.tools'
import { studentTools } from './student.tools'
import { ownerTools } from './owner.tools'
import { staffTools } from './staff.tools'
import type { ChatRole, ToolDefinition } from './types'

const ALL_TOOLS: ToolDefinition[] = [...publicTools, ...studentTools, ...ownerTools, ...staffTools]

const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]))

/** Tools visible to a given role — this is what gets sent to the provider as function specs. */
export function getToolsForRole(role: ChatRole): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => t.roles.includes(role))
}

export function getToolSpecsForRole(role: ChatRole): ProviderToolSpec[] {
  return getToolsForRole(role).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

/**
 * Looks up a tool by name AND re-checks role eligibility — the fact that a
 * name was offered in an earlier turn's tool spec list doesn't mean it's
 * safe to execute blindly; the role check happens again right before
 * execution, next to the actual call.
 */
export function getToolForRole(name: string, role: ChatRole): ToolDefinition | null {
  const tool = TOOLS_BY_NAME.get(name)
  if (!tool || !tool.roles.includes(role)) return null
  return tool
}
