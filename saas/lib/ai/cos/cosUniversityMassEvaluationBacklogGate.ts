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
// Production 2026-09-29: the queue read 61 waiting, above the limit of 48, so training stayed paused. 47 of
// those 61 were XSA students that cosUniversityXsaExamPause deliberately holds OUT of the canary and exam
// lanes while MASS_XSA_EXAMS_PAUSED is true. That pause keeps them evaluation_pending on purpose - PENDING,
// not FAIL - so they can never drain, and the backlog could never fall below the limit on its own. The gate
// measures downstream CAPACITY; a student the exam lane is forbidden to take consumes none of it, so counting
// it converted a deliberate exam pause into a permanent training freeze. Excluded here for that reason only.
// Every other waiting student still counts, the limit is unchanged, and if the exclusion cannot be read the
// gate keeps the full count and stays closed for new spend.
import { MASS_XSA_EXAMS_PAUSED } from './cosUniversityXsaExamPause.ts'

export const MASS_EVALUATION_BACKLOG_LIMIT_ENV = 'COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT' as const
export const MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT = 48
export const MASS_EVALUATION_BACKLOG_MAX_LIMIT = 5000

/** The receipt path the evaluator itself reads to decide an artifact is an XSA student. */
export const MASS_EVALUATION_BACKLOG_XSA_RECEIPT_PATH = 'intended_use->trainingReceipt->>xsaTrainingApplied' as const

export type MassEvaluationBacklogGate = Readonly<{
  ok: true
  open: boolean
  reason: 'evaluation_backlog_below_limit' | 'evaluation_backlog_full' | 'evaluation_backlog_unreadable'
  pendingEvaluation: number | null
  /** Waiting students the exam lane is currently forbidden to take, removed from pendingEvaluation. */
  examPausedExcluded: number
  limit: number
  error?: string
  authorityExpanded: false
}>

type CountResult = { count?: number | null; error?: { message?: string } | null }
type BacklogQuery = {
  eq(column: string, value: string): BacklogQuery
  like(column: string, pattern: string): PromiseLike<CountResult>
}
type BacklogDb = {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): BacklogQuery
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
  examPausedExcluded?: number
  error?: string
}): MassEvaluationBacklogGate {
  const excluded = Number.isSafeInteger(input.examPausedExcluded) && (input.examPausedExcluded as number) >= 0
    ? (input.examPausedExcluded as number)
    : 0
  if (input.pendingEvaluation === null || !Number.isFinite(input.pendingEvaluation) || input.pendingEvaluation < 0) {
    return Object.freeze({
      ok: true,
      open: false,
      reason: 'evaluation_backlog_unreadable',
      pendingEvaluation: null,
      examPausedExcluded: excluded,
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
    examPausedExcluded: excluded,
    limit: input.limit,
    authorityExpanded: false,
  })
}

function waitingMassArtifacts(db: BacklogDb): BacklogQuery {
  return db.from('cos_local_distillation_artifacts')
    .select('candidate_id', { count: 'exact', head: true })
    .eq('status', 'evaluation_pending')
}

/**
 * Waiting students the exam lane is forbidden to take right now.
 *
 * Returns null when the count cannot be read, which keeps the full backlog and the gate closed. An exclusion
 * that silently defaulted to zero-or-everything is how a spend gate becomes either a freeze or a blank cheque.
 */
async function readExamPausedWaiting(db: BacklogDb): Promise<number | null> {
  if (!MASS_XSA_EXAMS_PAUSED) return 0
  try {
    const result = await waitingMassArtifacts(db)
      .eq(MASS_EVALUATION_BACKLOG_XSA_RECEIPT_PATH, 'true')
      .like('candidate_id', 'mass:%')
    if (result.error) return null
    return typeof result.count === 'number' && Number.isSafeInteger(result.count) && result.count >= 0
      ? result.count
      : null
  } catch {
    return null
  }
}

/** Reads the live backlog: mass artifacts still waiting for independent evaluation. */
export async function readMassEvaluationBacklogGate(input: {
  db: BacklogDb | null | undefined
  env?: Record<string, string | undefined>
}): Promise<MassEvaluationBacklogGate> {
  const limit = massEvaluationBacklogLimit(input.env)
  if (!input.db) return massEvaluationBacklogDecision({ pendingEvaluation: null, limit, error: 'service_database_unavailable' })
  try {
    const result = await waitingMassArtifacts(input.db).like('candidate_id', 'mass:%')
    if (result.error) {
      return massEvaluationBacklogDecision({ pendingEvaluation: null, limit, error: String(result.error.message || 'backlog_read_failed') })
    }
    const waiting = typeof result.count === 'number' ? result.count : null
    if (waiting === null) return massEvaluationBacklogDecision({ pendingEvaluation: null, limit })

    // Only subtract what was actually counted. A failed exclusion read leaves the full backlog in place.
    const paused = await readExamPausedWaiting(input.db)
    const excluded = paused === null ? 0 : Math.min(paused, waiting)
    return massEvaluationBacklogDecision({
      pendingEvaluation: Math.max(0, waiting - excluded),
      examPausedExcluded: excluded,
      limit,
    })
  } catch (error) {
    return massEvaluationBacklogDecision({
      pendingEvaluation: null,
      limit,
      error: error instanceof Error ? error.message : 'backlog_read_failed',
    })
  }
}
// end of saas/lib/ai/cos/cosUniversityMassEvaluationBacklogGate.ts (if this line is missing, the paste was cut short)
