import {
  decideUniversityPracticeBudget,
  practiceBudgetRoundFromEvidence,
  type UniversityPracticeBudgetDecision,
} from './cosUniversityPracticeBudgetPolicy.ts'

export {
  DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS,
  configuredUniversityMaxPracticeRounds,
  decideUniversityPracticeBudget,
  practiceBudgetRoundFromEvidence,
  type UniversityPracticeBudgetDecision,
} from './cosUniversityPracticeBudgetPolicy.ts'

const ORIGIN = 'cos_university_deliberate_practice'
const MAX_BUDGET_HISTORY_ROWS = 200

async function serviceDb() {
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  return cosServiceDb()
}

function boundedRound(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function positiveCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function practiceRuntimeEnabled(request: { purpose?: string | null }): boolean {
  return request.purpose === 'practice' && process.env.COS_UNIVERSITY_PRACTICE_ENABLED === 'true'
}

async function readBudgetRows(input: { agentId: string; planId: string }) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const committed = await db.from('cos_active_practice_queue')
    .select('id,attempt_count,metadata,created_at')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN, agentId: input.agentId, universityPlanId: input.planId })
    .gt('attempt_count', 0)
    .order('created_at', { ascending: false })
    .limit(MAX_BUDGET_HISTORY_ROWS)
  if (committed.error) throw committed.error

  // Result-persistence failures leave attempt_count at zero, so read those rows separately and let
  // the durable pre-inference invocation marker decide whether they consumed the round budget.
  const uncommitted = await db.from('cos_active_practice_queue')
    .select('id,attempt_count,metadata,created_at')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN, agentId: input.agentId, universityPlanId: input.planId })
    .eq('attempt_count', 0)
    .order('created_at', { ascending: false })
    .limit(MAX_BUDGET_HISTORY_ROWS)
  if (uncommitted.error) throw uncommitted.error

  const byId = new Map<string, { attempt_count: unknown; metadata: unknown }>()
  for (const row of [...(committed.data || []), ...(uncommitted.data || [])]) {
    byId.set(String(row.id), row)
  }
  return [...byId.values()]
}

/** Read-only host meter used by both routing and the final execution fence. */
export async function readUniversityPracticeBudget(input: {
  agentId: string
  planId: string
  currentRound: unknown
}): Promise<UniversityPracticeBudgetDecision> {
  const currentRound = boundedRound(input.currentRound)
  if (!currentRound) return decideUniversityPracticeBudget({ currentRound, executedRounds: [] })
  const rows = await readBudgetRows(input)
  const executedRounds = new Set<number>()
  for (const row of rows) {
    const metadata = asRecord(row.metadata)
    const round = practiceBudgetRoundFromEvidence({
      practiceRound: metadata.practiceRound,
      attemptCount: row.attempt_count,
      practiceInvocationCount: metadata.practiceInvocationCount,
    })
    if (round !== null) executedRounds.add(round)
  }
  return decideUniversityPracticeBudget({ currentRound, executedRounds })
}

async function readPracticeInvocationContext(request: {
  runId: string
}): Promise<{ metadata: Record<string, unknown>; planId: string; practiceRound: number }> {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const current = await db.from('cos_active_practice_queue')
    .select('metadata,status')
    .eq('id', request.runId)
    .maybeSingle()
  if (current.error) throw current.error
  if (current.data?.status !== 'running') throw new Error('university_practice_invocation_not_running')
  const metadata = asRecord(current.data?.metadata)
  const planId = String(metadata.universityPlanId || '').trim()
  const practiceRound = boundedRound(metadata.practiceRound)
  if (!planId || !practiceRound) throw new Error('university_practice_round_missing')
  return { metadata, planId, practiceRound }
}

/** Final fail-closed circuit breaker immediately before any paid/model practice execution. */
export async function enforceUniversityPracticeCostGuard(request: {
  agentId: string
  runId: string
  purpose?: string | null
}): Promise<void> {
  if (!practiceRuntimeEnabled(request)) return
  const { planId, practiceRound } = await readPracticeInvocationContext(request)
  const decision = await readUniversityPracticeBudget({
    agentId: request.agentId,
    planId,
    currentRound: practiceRound,
  })
  if (!decision.allowed) {
    if (decision.reason === 'practice_round_invalid') throw new Error('university_practice_round_missing')
    throw new Error('university_practice_cost_guard_reached')
  }
}

/**
 * Persist cost evidence after the guard passes but before inference starts. A later result-RPC failure
 * therefore cannot erase the fact that this round consumed a model invocation. The running-row fence
 * prevents a stale worker from manufacturing spend after ownership has ended.
 */
export async function meterUniversityPracticeInvocation(request: {
  agentId: string
  runId: string
  purpose?: string | null
}): Promise<void> {
  if (!practiceRuntimeEnabled(request)) return
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const { metadata } = await readPracticeInvocationContext(request)
  const nowIso = new Date().toISOString()
  const update = await db.from('cos_active_practice_queue').update({
    metadata: {
      ...metadata,
      practiceInvocationCount: positiveCount(metadata.practiceInvocationCount) + 1,
      lastPracticeInvocationAt: nowIso,
    },
    updated_at: nowIso,
  }).eq('id', request.runId).eq('status', 'running')
    .select('id')
    .maybeSingle()
  if (update.error) throw update.error
  if (!update.data?.id) throw new Error('university_practice_invocation_meter_failed')
}
