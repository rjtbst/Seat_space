'use server'

// src/lib/actions/owner/plans.ts
// Split from owner.ts (Phase 4 / Priority 2.1) — plan builder CRUD.

import { revalidatePath } from 'next/cache'
import { getSupabaseUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/shared/action-result'
import { log, logError, timed } from '@/lib/logger'
import { z } from 'zod'

/* ═══════════════════════════════════════════════════════════════════════════
   PLAN BUILDER
═══════════════════════════════════════════════════════════════════════════ */
export type PlanWithStats = {
  id:               string
  name:             string
  price:            number
  duration_days:    number
  scope:            string
  time_window_start: string | null  // "HH:MM:SS" or null = no time restriction
  time_window_end:   string | null
  days_of_week:      number[] | null // 0=Sun..6=Sat, or null = every day
  is_active:        boolean
  subscriber_count: number
  libraries:        { id: string; name: string }[]
}

export async function getOwnerPlans(ownerId?: string): Promise<PlanWithStats[]> {
  return timed('getOwnerPlans', 'fetch plans + subscriber counts', async () => {
    const { supabase, user } = await getSupabaseUser()
    const uid = ownerId ?? user?.id
    if (!uid) return []

    const { data: plans, error: planErr } = await supabase
      .from('plans')
      .select(`id, name, price, duration_days, scope, time_window_start, time_window_end, days_of_week, plan_libraries(library_id, libraries(id, name))`)
      .eq('owner_id', uid)
      .order('created_at', { ascending: false })

    if (planErr) { logError('getOwnerPlans', 'Fetch failed', planErr); return [] }
    if (!plans?.length) return []

    const planIds = plans.map((p) => p.id)
    const { data: activeSubs } = await supabase
      .from('subscriptions').select('plan_id').in('plan_id', planIds).eq('status', 'active' as never)

    const subCountByPlan: Record<string, number> = {}
    for (const s of activeSubs ?? []) {
      if (!s.plan_id) continue
      subCountByPlan[s.plan_id] = (subCountByPlan[s.plan_id] ?? 0) + 1
    }

    return plans.map((p) => {
      const planLibs = (p as any).plan_libraries ?? []
      return {
        id:               p.id,
        name:             p.name ?? '',
        price:            Number(p.price ?? 0),
        duration_days:    p.duration_days ?? 30,
        scope:            (p.scope as string) ?? 'library',
        time_window_start: (p as any).time_window_start ?? null,
        time_window_end:   (p as any).time_window_end ?? null,
        days_of_week:      (p as any).days_of_week ?? null,
        is_active:        true,
        subscriber_count: subCountByPlan[p.id] ?? 0,
        libraries:        planLibs.map((pl: any) => ({ id: pl.libraries?.id ?? pl.library_id, name: pl.libraries?.name ?? '' })),
      }
    })
  })
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour) format')
const dayOfWeekSchema = z.array(z.number().int().min(0).max(6))

// Shared by create and update — same fields, same validation. Kept as one
// schema (rather than a create schema and a near-duplicate update schema)
// so the two actions can never quietly drift apart on what's a valid plan.
const planFieldsSchema = z.object({
  name:               z.string().min(2).max(80).trim(),
  price:              z.number().positive(),
  duration_days:      z.number().int().positive(),
  scope:              z.enum(['library', 'cross']),
  library_ids:        z.array(z.string().uuid()).min(1),
  // Optional time-of-day restriction, e.g. a "9 to 12" morning-only
  // plan. Both must be given together, or neither — enforced below
  // rather than with .refine() so the error message can point at
  // exactly what's missing/wrong instead of a generic schema error.
  time_window_start: timeSchema.optional(),
  time_window_end:   timeSchema.optional(),
  // Optional day-of-week restriction, e.g. a "Weekday Pass". Empty
  // array/undefined = every day. 0=Sunday..6=Saturday.
  days_of_week:      dayOfWeekSchema.optional(),
})
export type CreatePlanInput = z.infer<typeof planFieldsSchema>
export type UpdatePlanInput = CreatePlanInput & { planId: string }

function validatePlanFields(input: CreatePlanInput): { error: string } | { error: null } {
  const { time_window_start, time_window_end, days_of_week } = input
  if ((time_window_start && !time_window_end) || (!time_window_start && time_window_end)) {
    return { error: 'Set both a start and end time for the restricted hours, or leave both blank for no restriction.' }
  }
  if (time_window_start && time_window_end && time_window_start >= time_window_end) {
    return { error: 'The plan\'s start time must be earlier than its end time.' }
  }
  if (days_of_week && days_of_week.length === 0) {
    return { error: 'Select at least one day, or clear the day restriction entirely.' }
  }
  return { error: null }
}

/** Shared insert/update payload builder — one place that decides how the
 *  validated form fields map onto plans columns. */
function buildPlanPayload(input: CreatePlanInput) {
  const { name, price, duration_days, scope, time_window_start, time_window_end, days_of_week } = input
  return {
    name, price, duration_days,
    scope: scope as never,
    time_window_start: time_window_start ? `${time_window_start}:00` : null,
    time_window_end:   time_window_end   ? `${time_window_end}:00`   : null,
    days_of_week:      days_of_week && days_of_week.length > 0 ? days_of_week : null,
  }
}

/**
 * For scope='cross' ("all my libraries") plans, the set of linked
 * libraries is NOT the client's to decide — it's always "every active
 * library this owner currently has," kept in sync going forward by the
 * sync_library_into_cross_scope_plans trigger on the libraries table.
 * This is the write-time half of that same guarantee: even if the client
 * sent a stale or partial library_ids array (an old page, a replayed
 * request, a bug in a future screen), a cross-scope plan can never be
 * saved half-covering the owner's libraries. scope='library' plans are
 * untouched — that list is a deliberate owner choice, taken as-is.
 */
async function resolveLibraryIds(
  supabase: Awaited<ReturnType<typeof getSupabaseUser>>['supabase'],
  ownerId: string,
  scope: 'library' | 'cross',
  submittedIds: string[],
): Promise<string[]> {
  if (scope !== 'cross') return submittedIds

  const { data } = await supabase
    .from('libraries').select('id').eq('owner_id', ownerId).eq('is_active', true as never)
  const ids = (data as any[] ?? []).map(l => l.id)
  return ids.length > 0 ? ids : submittedIds
}

export async function createPlan(input: CreatePlanInput): Promise<ActionResult<{ planId: string }>> {
  const parsed = planFieldsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const fieldError = validatePlanFields(parsed.data)
  if (fieldError.error) return { success: false, error: fieldError.error }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .insert({ owner_id: user.id, ...buildPlanPayload(parsed.data) } as never)
    .select('id').single()

  if (planErr || !plan) { logError('createPlan', 'Insert failed', planErr); return { success: false, error: planErr?.message ?? 'Failed to create plan' } }

  const libraryIds = await resolveLibraryIds(supabase, user.id, parsed.data.scope, parsed.data.library_ids)

  const { error: linkErr } = await supabase
    .from('plan_libraries').insert(libraryIds.map((lid) => ({ plan_id: plan.id, library_id: lid })))
  if (linkErr) { logError('createPlan', 'Link insert failed', linkErr); return { success: false, error: linkErr.message } }

  log('createPlan', `plan=${plan.id} name=${parsed.data.name}`)
  revalidatePath('/dashboard/plan-builder')
  return { success: true, data: { planId: plan.id } }
}

/**
 * Plans were create-or-archive only until now — any change meant
 * archiving and recreating, which loses the plan's subscriber history
 * and forces existing subscribers onto a "new" plan_id they never
 * explicitly agreed to. This lets an owner actually edit a plan in
 * place.
 *
 * Important, and surfaced in the UI rather than hidden here: the
 * `subscriptions` table has no snapshot of price/time window at signup
 * time — it always joins live to `plans`. That means editing price only
 * affects future signups (past payments already happened and are
 * immutable), but editing the time window or days_of_week takes effect
 * immediately for EXISTING active subscribers too, since there's nothing
 * else for their entitlement check to read. PlanBuilderClient warns about
 * this before saving when the plan being edited has active subscribers.
 */
export async function updatePlan(input: UpdatePlanInput): Promise<ActionResult> {
  const { planId, ...fields } = input
  const parsed = planFieldsSchema.safeParse(fields)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const fieldError = validatePlanFields(parsed.data)
  if (fieldError.error) return { success: false, error: fieldError.error }

  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('plans').select('owner_id').eq('id', planId).maybeSingle()
  if ((existing as any)?.owner_id !== user.id) return { success: false, error: 'Access denied' }

  const { error: updateErr } = await supabase
    .from('plans')
    .update(buildPlanPayload(parsed.data) as never)
    .eq('id', planId)

  if (updateErr) { logError('updatePlan', 'Update failed', updateErr); return { success: false, error: updateErr.message } }

  // Libraries linked to the plan can change too — simplest correct
  // approach is replace-all rather than diffing adds/removes, matching
  // how createPlan already treats plan_libraries as a fresh set.
  const { error: deleteLinkErr } = await supabase.from('plan_libraries').delete().eq('plan_id', planId)
  if (deleteLinkErr) { logError('updatePlan', 'Link delete failed', deleteLinkErr); return { success: false, error: deleteLinkErr.message } }

  const libraryIds = await resolveLibraryIds(supabase, user.id, parsed.data.scope, parsed.data.library_ids)

  const { error: linkErr } = await supabase
    .from('plan_libraries').insert(libraryIds.map((lid) => ({ plan_id: planId, library_id: lid })))
  if (linkErr) { logError('updatePlan', 'Link insert failed', linkErr); return { success: false, error: linkErr.message } }

  log('updatePlan', `plan=${planId} name=${parsed.data.name}`)
  revalidatePath('/dashboard/plan-builder')
  return { success: true, data: undefined }
}

export async function archivePlan(planId: string): Promise<ActionResult> {
  const { supabase, user } = await getSupabaseUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: plan } = await supabase
    .from('plans').select('owner_id').eq('id', planId).maybeSingle()
  if ((plan as any)?.owner_id !== user.id) return { success: false, error: 'Access denied' }

  await Promise.all([
    supabase.from('plan_libraries').delete().eq('plan_id', planId),
    supabase.from('plans').delete().eq('id', planId),
  ])

  log('archivePlan', `plan=${planId}`)
  revalidatePath('/dashboard/plan-builder')
  return { success: true, data: undefined }
}
