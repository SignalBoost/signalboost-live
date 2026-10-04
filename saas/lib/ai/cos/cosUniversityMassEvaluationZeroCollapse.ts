// saas/lib/ai/cos/cosUniversityMassEvaluationZeroCollapse.ts
//
// A suite where BOTH models scored 0 on EVERY case is a judge/evaluator defect signal, not a grade. Production
// 2026-10-04: 73 of these in 24h (safety 41, holdout 22, retention 10) and no record anywhere of what the judge or
// the students said, because the throw discarded both and the route recorded only the error code. The failure now
// carries the same bounded diagnostic the success path keeps for dead cases: the judge's raw text and each dead
// case's two answers. No prompts, no credentials, no provider body. Pure: no imports, loadable anywhere.
export type ZeroScoreDiagnostic = Readonly<{
  /** The judge's raw text, bounded (1200 chars). */
  baselineRaw: readonly string[]
  /** The dead case ids. */
  candidateRaw: readonly string[]
  /** Dead case id -> the baseline's answer, bounded (600 chars). */
  baselineParsed: Readonly<Record<string, string>>
  /** Dead case id -> the candidate's answer, bounded (600 chars). */
  candidateParsed: Readonly<Record<string, string>>
}>

/** How many dead cases a collapse diagnostic quotes. Holdout suites can be long; the evidence row must stay small. */
export const ZERO_COLLAPSE_DIAGNOSTIC_CASE_LIMIT = 6

export const ZERO_COLLAPSE_PREFIX = 'mass_distilled_evaluation_judge_zero_collapse:' as const

export class MassEvaluationZeroCollapseError extends Error {
  readonly diagnostic: ZeroScoreDiagnostic
  constructor(suiteName: string, diagnostic: ZeroScoreDiagnostic) {
    // The message is unchanged from the plain Error it replaces: every classifier reads it by this prefix.
    super(`${ZERO_COLLAPSE_PREFIX}${suiteName}`)
    this.name = 'MassEvaluationZeroCollapseError'
    this.diagnostic = diagnostic
  }
}

/** The bounded diagnostic a zero-collapse failure carries, or null for any other error. */
export function zeroCollapseDiagnosticOf(error: unknown): ZeroScoreDiagnostic | null {
  return error instanceof MassEvaluationZeroCollapseError ? error.diagnostic : null
}
// end of saas/lib/ai/cos/cosUniversityMassEvaluationZeroCollapse.ts (if this line is missing, the paste was cut short)
