/**
 * Whether a required evidence stage has any supply at all.
 *
 * A blocker like `verified_practical_work_incomplete` reads as "the learner has not done this yet".
 * That is true only if the evidence could arrive. Master's practical work requires evidence with
 * authority `verified_production`, which is written by exactly one lane, from
 * `cos_turn_outcomes` rows whose `outcome_source` sits in the `production_verified:` namespace.
 *
 * The canonical writer is the guarded verified-production outcome recorder. It may create this
 * namespace only for an exact `cos_turn_id` correlation after an authoritative deterministic tool,
 * production outcome, or authoritative record has passed the existing evidence guard. Model/Council
 * self-claims, ordinary feedback, benchmarks, exams, tests and uncorrelated events cannot manufacture
 * this supply. The Master's reader still applies its own enrollment, recency, subject and source
 * gates before any row can become academic practical-work evidence.
 *
 * This module does not create, infer or relax evidence. It reports supply so "unmet" can be
 * distinguished from a structurally unavailable evidence lane.
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