import {
  decideUniversityPracticeBudget,
  type UniversityPracticeBudgetDecision,
} from './cosUniversityPracticeBudgetPolicy.ts'

export {
  DEFAULT_UNIVERSITY_MAX_PRACTICE_ROUNDS,
  configuredUniversityMaxPracticeRounds,
  decideUniversityPracticeBudget,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Read-only host meter used by both routing and the final execution fence. */
export async function readUniversityPracticeBudget(input: {
  agentId: string
  planId: string
  currentRound: unknown
}): Promise<UniversityPracticeBudgetDecision> {
  const db = await serviceDb()
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

  const executedRounds = [...new Set<number>((result.data || [])
    .map(row => boundedRound(asRecord(row.metadata).practiceRound))
    .filter((round): round is number => round !== null))]
  return decideUniversityPracticeBudget({ currentRound, executedRounds })
}

/** Final fail-closed circuit breaker immediately before any paid/model practice execution. */
export async function enforceUniversityPracticeCostGuard(request: {
  agentId: string
  runId: string
  purpose?: string | null
}): Promise<void> {
  if (request.purpose !== 'practice' || process.env.COS_UNIVERSITY_PRACTICE_ENABLED !== 'true') return
  const db = await serviceDb()
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
