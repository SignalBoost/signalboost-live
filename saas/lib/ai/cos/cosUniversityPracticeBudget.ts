import { cosServiceDb } from '../../cos-core/storage/supabase.ts'

const ORIGIN = 'cos_university_deliberate_practice'
export const DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS = 12
const MAX_BUDGET_HISTORY_ROWS = 200

type PracticeBudgetEnv = { UNIVERSITY_MAX_PRACTICE_ROUNDS?: string }

export type UniversityPracticeBudgetDecision = Readonly<{
  allowed: boolean
  reason: 'within_budget' | 'current_round_already_metered' | 'practice_budget_exhausted' | 'practice_round_invalid'
  maxRounds: number
  executedRoundCount: number
  currentRound: number | null
}>

function boundedRound(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

export function configuredUniversityMaxPracticeRounds(
  env: PracticeBudgetEnv = process.env,
): number {
  const configured = Number(env.UNIVERSITY_MAX_PRACTICE_ROUNDS || DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS)
  return Number.isSafeInteger(configured)
    ? Math.max(2, Math.min(50, configured))
    : DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS
}

/**
 * The study-attempt ordinal is not spend. A plan may restudy many times without invoking inference,
 * so the cost ceiling counts only distinct practice rounds that have at least one committed execution.
 * If one variant of the current round already executed, the sibling variant may finish that same
 * already-metered round even when the maximum number of rounds has been reached.
 */
export function decideUniversityPracticeBudget(input: {
  currentRound: unknown
  executedRounds: Iterable<unknown>
  maxRounds?: number
}): UniversityPracticeBudgetDecision {
  const currentRound = boundedRound(input.currentRound)
  const maxRounds = Number.isSafeInteger(input.maxRounds)
    ? Math.max(2, Math.min(50, Number(input.maxRounds)))
    : configuredUniversityMaxPracticeRounds()
  const executed = new Set<number>()
  for (const value of input.executedRounds) {
    const round = boundedRound(value)
    if (round) executed.add(round)
  }

  if (!currentRound) {
    return { allowed: false, reason: 'practice_round_invalid', maxRounds, executedRoundCount: executed.size, currentRound: null }
  }
  if (executed.has(currentRound)) {
    return { allowed: true, reason: 'current_round_already_metered', maxRounds, executedRoundCount: executed.size, currentRound }
  }
  if (executed.size >= maxRounds) {
    return { allowed: false, reason: 'practice_budget_exhausted', maxRounds, executedRoundCount: executed.size, currentRound }
  }
  return { allowed: true, reason: 'within_budget', maxRounds, executedRoundCount: executed.size, currentRound }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Read-only host meter used by both routing and the final execution fence. */
export async function readUniversityPracticeBudget(input: {
  agentId: string
  planId: string
  currentRound: unknown
}): Promise<UniversityPracticeBudgetDecision> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const currentRound = boundedRound(input.currentRound)
  if (!currentRound) return decideUniversityPracticeBudget({ currentRound, executedRounds: [] })

  const result = await db.from('cos_active_practice_queue')
    .select('attempt_count,metadata')
    .eq('generation_source', 'curated')
    .contains('metadata', {
      origin: ORIGIN,
      agentId: input.agentId,
      universityPlanId: input.planId,
    })
    .gt('attempt_count', 0)
    .order('created_at', { ascending: false })
    .limit(MAX_BUDGET_HISTORY_ROWS)
  if (result.error) throw result.error

  const executedRounds = (result.data || []).map(row => asRecord(row.metadata).practiceRound)
  return decideUniversityPracticeBudget({ currentRound, executedRounds })
}

/** Final fail-closed circuit breaker immediately before any paid/model practice execution. */
export async function enforceUniversityPracticeCostGuard(request: {
  agentId: string
  runId: string
  purpose?: string | null
}): Promise<void> {
  if (request.purpose !== 'practice') return
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const current = await db.from('cos_active_practice_queue')
    .select('metadata')
    .eq('id', request.runId)
    .maybeSingle()
  if (current.error) throw current.error
  const metadata = asRecord(current.data?.metadata)
  const planId = String(metadata.universityPlanId || '').trim()
  const practiceRound = boundedRound(metadata.practiceRound)
  if (!planId || !practiceRound) throw new Error('university_practice_round_missing')

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
