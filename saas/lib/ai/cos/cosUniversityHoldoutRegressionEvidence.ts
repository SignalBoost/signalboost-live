// saas/lib/ai/cos/cosUniversityHoldoutRegressionEvidence.ts
//
// What a regressed holdout case actually looked like (owner go, 2026-10-07).
//
// Production 2026-10-07: 5 of 12 exams under the significance gate scored BELOW their own baseline (-0.17 to -0.75;
// one artifact 1.00 -> 0.25 on 12 cases). The evaluator keeps per-case scores but discards both answers, so nothing
// recorded could say whether a trained artifact's lost case was an empty or truncated answer (a training-recipe or
// format defect) or a full, wrong answer (lost knowledge). Those need different repairs.
//
// For every holdout case where the trained artifact scored strictly below the baseline, this records the two scores,
// both answers' lengths and a bounded excerpt of each answer. An EMPTY candidate answer never reaches this point: it
// fails the exam as mass_distilled_evaluation_candidate_answer_empty (a merit failure, counted in the Evaluation failure
// trace), so every case recorded here was answered and scored. It is written
// on the exam's own run row (response_hashes.holdoutRegressionEvidence, the column that already carries dead-case
// diagnostics). It is evidence only: it is never read by scoring, gating, promotion or spend.
export const HOLDOUT_REGRESSION_EVIDENCE_PROFILE = 'cos-university-holdout-regression-evidence-v1' as const
const EXCERPT_CHARS = 280
const MAX_CASES = 24

export type HoldoutRegressionCase = Readonly<{
  id: string
  baseline: number
  candidate: number
  baselineChars: number
  candidateChars: number
  baselineExcerpt: string
  candidateExcerpt: string
}>

export type HoldoutRegressionEvidence = Readonly<{
  profile: typeof HOLDOUT_REGRESSION_EVIDENCE_PROFILE
  holdoutCases: number
  regressedCases: number
  cases: readonly HoldoutRegressionCase[]
}>

const flat = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

export function buildHoldoutRegressionEvidence(input: {
  scored: readonly Readonly<{ id: string; baseline: number; candidate: number }>[]
  baselineAnswers: ReadonlyMap<string, string>
  candidateAnswers: ReadonlyMap<string, string>
}): HoldoutRegressionEvidence {
  const regressed = input.scored.filter(item => item.candidate < item.baseline)
  const cases = regressed.slice(0, MAX_CASES).map(item => {
    const baselineAnswer = flat(input.baselineAnswers.get(item.id))
    const candidateAnswer = flat(input.candidateAnswers.get(item.id))
    return Object.freeze({
      id: flat(item.id).slice(0, 100),
      baseline: item.baseline,
      candidate: item.candidate,
      baselineChars: baselineAnswer.length,
      candidateChars: candidateAnswer.length,
      baselineExcerpt: baselineAnswer.slice(0, EXCERPT_CHARS),
      candidateExcerpt: candidateAnswer.slice(0, EXCERPT_CHARS),
    })
  })
  return Object.freeze({
    profile: HOLDOUT_REGRESSION_EVIDENCE_PROFILE,
    holdoutCases: input.scored.length,
    regressedCases: regressed.length,
    cases: Object.freeze(cases),
  })
}

const median = (values: readonly number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export type HoldoutRegressionSummary = Readonly<{
  /** Latest exams that recorded regression evidence (exams before 2026-10-07 have none). */
  examsWithEvidence: number
  examsWithoutEvidence: number
  examsWithARegressedCase: number
  regressedCases: number
  medianCandidateChars: number | null
  medianBaselineChars: number | null
  /** Exams whose baseline already scored at least 0.9 on the holdout: little room left to show a gain. */
  examsWithBaselineAtLeast0_9: number
}>

/** Counts and lengths only: no ids, prompts or answer text. */
export function summarizeHoldoutRegressionEvidence(exams: readonly Readonly<{ baseline: number | null; evidence: unknown }>[]): HoldoutRegressionSummary {
  let withEvidence = 0
  let without = 0
  let withRegressed = 0
  let atCeiling = 0
  const candidateChars: number[] = []
  const baselineChars: number[] = []
  let regressedCases = 0
  for (const exam of exams) {
    if (exam.baseline !== null && exam.baseline >= 0.9) atCeiling += 1
    const evidence = exam.evidence && typeof exam.evidence === 'object' ? exam.evidence as Record<string, unknown> : null
    if (!evidence || evidence.profile !== HOLDOUT_REGRESSION_EVIDENCE_PROFILE || !Array.isArray(evidence.cases)) { without += 1; continue }
    withEvidence += 1
    const count = Number(evidence.regressedCases)
    if (Number.isFinite(count) && count > 0) withRegressed += 1
    regressedCases += Number.isFinite(count) ? count : 0
    for (const item of evidence.cases as unknown[]) {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      if (Number.isFinite(Number(row.candidateChars))) candidateChars.push(Number(row.candidateChars))
      if (Number.isFinite(Number(row.baselineChars))) baselineChars.push(Number(row.baselineChars))
    }
  }
  return Object.freeze({
    examsWithEvidence: withEvidence,
    examsWithoutEvidence: without,
    examsWithARegressedCase: withRegressed,
    regressedCases,
    medianCandidateChars: median(candidateChars),
    medianBaselineChars: median(baselineChars),
    examsWithBaselineAtLeast0_9: atCeiling,
  })
}
