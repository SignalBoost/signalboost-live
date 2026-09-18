/**
 * Whether a required evidence stage has any supply at all.
 *
 * A blocker like `verified_practical_work_incomplete` reads as "the learner has not done this yet".
 * That is true only if the evidence could arrive. Master's practical work requires evidence with
 * authority `verified_production`, which is written by exactly one lane, from
 * `cos_turn_outcomes` rows whose `outcome_source` sits in the `production_verified:` namespace.
 *
 * Nothing in this repository writes that namespace. It appears in four readers and three test files
 * and in no writer, no route and no migration. Whatever tags a real production turn as verified
 * lives outside the repo or does not exist yet. Until it runs, `minimumDistinctPracticalPasses: 1`
 * is unsatisfiable, so no Master's credential can be awarded for any learner — and the board reports
 * that permanent condition in the same words it uses for a learner who simply has not finished.
 *
 * This module does not create, infer or relax evidence. It reports supply so the two can be told
 * apart, exactly as the lane expectation layer separates a gated lane from a dark one.
 */

export const COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE = 'production_verified:'

export type CosUniversityEvidenceSupply = Readonly<{
  /** Rows observed in the namespace this requirement draws from, within the window examined. */
  observed: number
  /** True when the requirement can be met by evidence that already exists or is being produced. */
  supplied: boolean
  /**
   * `unmet` — the requirement is genuinely outstanding and evidence is arriving.
   * `unsupplied` — no evidence of this kind has ever been observed, so the requirement cannot be
   *   met by anything currently running. Not the learner's failure and not a defect in the gate.
   * `met` — the requirement is satisfied.
   */
  state: 'met' | 'unmet' | 'unsupplied'
}>

/**
 * Classify one requirement. `required` and `earned` come from the graduation evaluator; `observed`
 * is the count of candidate rows in the supplying namespace. Zero observed with a positive
 * requirement is the honest `unsupplied` case.
 */
export function cosUniversityEvidenceSupply(input: {
  required: number
  earned: number
  observed: number
}): CosUniversityEvidenceSupply {
  const required = Number.isSafeInteger(input.required) && input.required > 0 ? input.required : 0
  const earned = Number.isSafeInteger(input.earned) && input.earned > 0 ? input.earned : 0
  const observed = Number.isSafeInteger(input.observed) && input.observed > 0 ? input.observed : 0
  if (!required || earned >= required) return Object.freeze({ observed, supplied: true, state: 'met' })
  if (observed > 0) return Object.freeze({ observed, supplied: true, state: 'unmet' })
  return Object.freeze({ observed: 0, supplied: false, state: 'unsupplied' })
}

/** True for an outcome source that can supply verified-production academic evidence. */
export function isCosUniversityProductionOutcomeSource(source: unknown): boolean {
  const value = String(source ?? '').trim()
  return value.startsWith(COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE)
    && value.length > COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE.length
}
