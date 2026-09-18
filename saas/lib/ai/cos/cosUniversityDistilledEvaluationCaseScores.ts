// saas/lib/ai/cos/cosUniversityDistilledEvaluationCaseScores.ts
// Persists the per-case scores the judge already returns and the evaluator previously discarded.
//
// Suite averages alone cannot distinguish "the student failed two cases badly" from "the student was
// mediocre everywhere", and cannot show that a suite reporting 1.0 has stopped discriminating. Both
// questions decide the distillation recipe, so the per-case rows are evidence and are written with the
// same strictness as the run row: a failed write fails the evaluation rather than silently producing a
// run whose detail is unrecoverable. The write is idempotent on (run_key, suite, case_id), so a retry
// of the same run re-writes identical rows.
//
// This module never reads these rows back into any scoring, gating or promotion decision. It is a
// recorder only; promotion continues to depend solely on the suite aggregates in
// cos_university_distilled_evaluation_runs.

export type DistilledEvaluationScoredCase = Readonly<{
  id: string
  baseline: number
  candidate: number
  candidateSafe: boolean
}>

export type DistilledEvaluationSuiteCases = Readonly<{
  suite: 'holdout' | 'safety' | 'transfer' | 'retention'
  scored: readonly DistilledEvaluationScoredCase[]
}>

export type DistilledEvaluationCaseRow = Readonly<{
  run_key: string
  suite: string
  case_id: string
  baseline_score: number
  candidate_score: number
  candidate_safe: boolean
  candidate_id: string
  trained_artifact_hash: string
  evaluator_id: string
  evaluator_version: string
  observed_at: string
}>

const SUITES = new Set(['holdout', 'safety', 'transfer', 'retention'])

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Clamp to the column's numeric(5,4) range and reject anything the judge could not have produced.
 * Only a number is accepted: Number(null), Number('') and Number(false) all coerce to a finite 0 that
 * sits inside the valid range, so coercing first would record an absent judge score as a real 0.0.
 */
function boundedScore(value: unknown): number {
  if (typeof value !== 'number') throw new Error('distilled_evaluation_case_score_invalid')
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('distilled_evaluation_case_score_invalid')
  return Math.round(value * 10_000) / 10_000
}

export function buildDistilledEvaluationCaseRows(input: {
  runKey: string
  candidateId: string
  artifactHash: string
  evaluatorId: string
  evaluatorVersion: string
  observedAt: string
  suites: readonly DistilledEvaluationSuiteCases[]
}): DistilledEvaluationCaseRow[] {
  const runKey = text(input.runKey, 64)
  const candidateId = text(input.candidateId, 240)
  const artifactHash = text(input.artifactHash, 64).toLowerCase()
  const evaluatorId = text(input.evaluatorId, 240)
  const evaluatorVersion = text(input.evaluatorVersion, 120)
  if (!runKey || !candidateId || !artifactHash || !evaluatorId || !evaluatorVersion) {
    throw new Error('distilled_evaluation_case_identity_missing')
  }
  const rows: DistilledEvaluationCaseRow[] = []
  const seen = new Set<string>()
  for (const suite of input.suites) {
    if (!SUITES.has(suite.suite)) throw new Error('distilled_evaluation_case_suite_invalid')
    for (const scored of suite.scored) {
      const caseId = text(scored.id, 100)
      if (!caseId) throw new Error('distilled_evaluation_case_id_missing')
      const key = `${suite.suite}:${caseId}`
      // The judge is already required to return exactly one entry per case; a duplicate here would
      // silently drop a row on upsert, so fail closed instead.
      if (seen.has(key)) throw new Error('distilled_evaluation_case_duplicate')
      seen.add(key)
      if (typeof scored.candidateSafe !== 'boolean') throw new Error('distilled_evaluation_case_safety_invalid')
      rows.push(Object.freeze({
        run_key: runKey,
        suite: suite.suite,
        case_id: caseId,
        baseline_score: boundedScore(scored.baseline),
        candidate_score: boundedScore(scored.candidate),
        candidate_safe: scored.candidateSafe,
        candidate_id: candidateId,
        trained_artifact_hash: artifactHash,
        evaluator_id: evaluatorId,
        evaluator_version: evaluatorVersion,
        observed_at: input.observedAt,
      }))
    }
  }
  if (!rows.length) throw new Error('distilled_evaluation_case_rows_empty')
  return rows
}

export async function persistDistilledEvaluationCaseScores(input: {
  db: { from: (table: string) => any }
  runKey: string
  candidateId: string
  artifactHash: string
  evaluatorId: string
  evaluatorVersion: string
  observedAt: string
  suites: readonly DistilledEvaluationSuiteCases[]
}): Promise<number> {
  const rows = buildDistilledEvaluationCaseRows(input)
  const result = await input.db
    .from('cos_university_distilled_evaluation_cases')
    .upsert(rows, { onConflict: 'run_key,suite,case_id' })
  if (result?.error) throw result.error
  return rows.length
}
