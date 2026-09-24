// saas/lib/ai/cos/cosUniversityMassEvaluationBacklogGate.ts
//
// Production 2026-09-24: mass training produced 316 artifacts in 24h while the downstream exact-artifact
// canary lane passed 9 and the independent evaluator completed 3. 960 artifacts were past the 12h retention
// delay with only 8 holding a passed canary, and 659 of 719 evaluator ticks found nothing claimable.
// Training was spending money on artifacts that could never be judged.
//
// This gate matches paid training to the pipeline's real downstream capacity: while the number of mass
// artifacts still waiting for independent evaluation is at or above the limit, no NEW campaign is authorized
// and no new paid stage is dispatched. In-flight provider jobs, reconciliation, recovery, canaries and
// evaluation continue untouched, so the backlog drains and training resumes automatically.
//
// It never approves, evaluates, promotes or activates anything, and it grants no authority. A backlog that
// cannot be read fails closed for new spend only.

export const MASS_EVALUATION_BACKLOG_LIMIT_ENV = 'COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT' as const
export const MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT = 48
export const MASS_EVALUATION_BACKLOG_MAX_LIMIT = 5000

export type MassEvaluationBacklogGate = Readonly<{
  ok: true
  open: boolean
  reason: 'evaluation_backlog_below_limit' | 'evaluation_backlog_full' | 'evaluation_backlog_unreadable'
  pendingEvaluation: number | null
  limit: number
  error?: string
  authorityExpanded: false
}>

type CountResult = { count?: number | null; error?: { message?: string } | null }
type BacklogDb = {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): {
      eq(column: string, value: string): {
        like(column: string, pattern: string): PromiseLike<CountResult>
      }
    }
  }
}

/** Buyer/owner-tunable limit. Invalid values fall back to the default; the ceiling is bounded. */
export function massEvaluationBacklogLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = String(env[MASS_EVALUATION_BACKLOG_LIMIT_ENV] ?? '').trim()
  if (!/^\d+$/.test(raw)) return MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) return MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT
  return Math.min(MASS_EVALUATION_BACKLOG_MAX_LIMIT, Math.max(0, value))
}

/** Pure decision: new paid training may start only while waiting artifacts are below the limit. */
export function massEvaluationBacklogDecision(input: {
  pendingEvaluation: number | null
  limit: number
  error?: string
}): MassEvaluationBacklogGate {
  if (input.pendingEvaluation === null || !Number.isFinite(input.pendingEvaluation) || input.pendingEvaluation < 0) {
    return Object.freeze({
      ok: true,
      open: false,
      reason: 'evaluation_backlog_unreadable',
      pendingEvaluation: null,
      limit: input.limit,
      ...(input.error ? { error: input.error.slice(0, 300) } : {}),
      authorityExpanded: false,
    })
  }
  const open = input.pendingEvaluation < input.limit
  return Object.freeze({
    ok: true,
    open,
    reason: open ? 'evaluation_backlog_below_limit' : 'evaluation_backlog_full',
    pendingEvaluation: input.pendingEvaluation,
    limit: input.limit,
    authorityExpanded: false,
  })
}

/** Reads the live backlog: mass artifacts still waiting for independent evaluation. */
export async function readMassEvaluationBacklogGate(input: {
  db: BacklogDb | null | undefined
  env?: Record<string, string | undefined>
}): Promise<MassEvaluationBacklogGate> {
  const limit = massEvaluationBacklogLimit(input.env)
  if (!input.db) return massEvaluationBacklogDecision({ pendingEvaluation: null, limit, error: 'service_database_unavailable' })
  try {
    const result = await input.db.from('cos_local_distillation_artifacts')
      .select('candidate_id', { count: 'exact', head: true })
      .eq('status', 'evaluation_pending')
      .like('candidate_id', 'mass:%')
    if (result.error) {
      return massEvaluationBacklogDecision({ pendingEvaluation: null, limit, error: String(result.error.message || 'backlog_read_failed') })
    }
    return massEvaluationBacklogDecision({ pendingEvaluation: typeof result.count === 'number' ? result.count : null, limit })
  } catch (error) {
    return massEvaluationBacklogDecision({
      pendingEvaluation: null,
      limit,
      error: error instanceof Error ? error.message : 'backlog_read_failed',
    })
  }
}
