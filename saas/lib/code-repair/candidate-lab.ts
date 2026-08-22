/**
 * Candidate Lab promotion gate.
 *
 * This module intentionally evaluates only explicit benchmark observations.  It does not run
 * code, apply a patch, create a pull request, deploy, or grant any authority.  A recommendation
 * is therefore evidence for a human reviewer, never an automatic promotion decision.
 */
export interface CandidateLabObservation {
  caseId: string
  passed: boolean
  governancePassed: boolean
  qualityScore: number
}

export interface CandidateLabEvaluationInput {
  candidateId: string
  baseline: readonly CandidateLabObservation[]
  candidate: readonly CandidateLabObservation[]
  minimumMatchedCases?: number
}

export type CandidateLabDecisionReason =
  | 'insufficient_matched_cases'
  | 'duplicate_case_id'
  | 'cohort_mismatch'
  | 'baseline_governance_failure'
  | 'candidate_governance_regression'
  | 'capability_regression'
  | 'no_measured_improvement'
  | 'recommend_human_review'

export interface CandidateLabEvaluation {
  candidateId: string
  matchedCaseCount: number
  baselinePassed: number
  candidatePassed: number
  baselineQuality: number
  candidateQuality: number
  passRateDelta: number
  qualityDelta: number
  recommendedForHumanReview: boolean
  automaticPromotionAllowed: false
  reasons: readonly CandidateLabDecisionReason[]
}

/** Immutable evidence that binds a matched-cohort result to one exact candidate change. */
export interface CandidateLabEvidence {
  candidateId: string
  candidateChangeFingerprint: string
  baselineCohortFingerprint: string
  candidateCohortFingerprint: string
  evaluation: CandidateLabEvaluation
  humanApprovalRequired: true
  automaticPromotionAllowed: false
}

export interface CandidateLabCase { caseId: string }
export interface CandidateLabEvaluator {
  evaluate(input: Readonly<{ candidateChangeFingerprint: string; caseId: string }>): Promise<Omit<CandidateLabObservation, 'caseId'>>
}
export interface CandidateLabExecutionInput {
  candidateId: string
  baselineChangeFingerprint: string
  candidateChangeFingerprint: string
  cases: readonly CandidateLabCase[]
  evaluator: CandidateLabEvaluator
  minimumMatchedCases?: number
}
export interface CandidateLabExecutionFailure {
  caseId: string
  candidateChangeFingerprint: string
  safeSummary: string
}
export interface CandidateLabExecutionResult {
  completed: boolean
  evidence: CandidateLabEvidence | null
  failures: readonly CandidateLabExecutionFailure[]
}

const DEFAULT_MINIMUM_MATCHED_CASES = 3

function normalizedScore(value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : Number.NaN
}

function index(observations: readonly CandidateLabObservation[]): Map<string, CandidateLabObservation> | null {
  const result = new Map<string, CandidateLabObservation>()
  for (const observation of observations) {
    if (!observation.caseId || result.has(observation.caseId) || Number.isNaN(normalizedScore(observation.qualityScore))) return null
    result.set(observation.caseId, observation)
  }
  return result
}

function average(items: readonly CandidateLabObservation[]): number {
  return items.reduce((total, item) => total + item.qualityScore, 0) / items.length
}

function canonicalObservation(observation: CandidateLabObservation): string {
  return JSON.stringify([observation.caseId, observation.passed, observation.governancePassed, observation.qualityScore])
}

/** Stable, non-secret identifier for a cohort's exact observed results. */
export function fingerprintCandidateLabCohort(observations: readonly CandidateLabObservation[]): string {
  return observations.map(canonicalObservation).sort().join('\n')
}

export function evaluateCandidateLab(input: CandidateLabEvaluationInput): CandidateLabEvaluation {
  const minimum = input.minimumMatchedCases ?? DEFAULT_MINIMUM_MATCHED_CASES
  const reasons: CandidateLabDecisionReason[] = []
  const baseline = index(input.baseline)
  const candidate = index(input.candidate)
  if (!baseline || !candidate) reasons.push('duplicate_case_id')
  const baselineCases = baseline ? [...baseline.values()] : []
  const candidateCases = candidate ? [...candidate.values()] : []
  const sameCohort = baseline && candidate && baseline.size === candidate.size && [...baseline.keys()].every(caseId => candidate.has(caseId))
  if (!sameCohort) reasons.push('cohort_mismatch')
  const matchedCaseCount = sameCohort ? baselineCases.length : 0
  if (!Number.isSafeInteger(minimum) || minimum < 1 || matchedCaseCount < minimum) reasons.push('insufficient_matched_cases')

  const baselinePassed = baselineCases.filter(item => item.passed).length
  const candidatePassed = candidateCases.filter(item => item.passed).length
  const baselineQuality = baselineCases.length ? average(baselineCases) : 0
  const candidateQuality = candidateCases.length ? average(candidateCases) : 0
  const passRateDelta = matchedCaseCount ? (candidatePassed - baselinePassed) / matchedCaseCount : 0
  const qualityDelta = matchedCaseCount ? candidateQuality - baselineQuality : 0

  if (baselineCases.some(item => !item.governancePassed)) reasons.push('baseline_governance_failure')
  if (candidateCases.some(item => !item.governancePassed)) reasons.push('candidate_governance_regression')
  if (sameCohort && candidatePassed < baselinePassed) reasons.push('capability_regression')
  if (sameCohort && candidatePassed === baselinePassed && qualityDelta <= 0) reasons.push('no_measured_improvement')

  const blocked = reasons.length > 0
  if (!blocked) reasons.push('recommend_human_review')
  return Object.freeze({
    candidateId: input.candidateId,
    matchedCaseCount,
    baselinePassed,
    candidatePassed,
    baselineQuality,
    candidateQuality,
    passRateDelta,
    qualityDelta,
    recommendedForHumanReview: !blocked,
    automaticPromotionAllowed: false,
    reasons: Object.freeze(reasons),
  })
}

/**
 * Creates an approval artifact for one candidate change. Consumers must bind this to the same
 * patch/proposal fingerprint they reviewed; a new patch always needs a new evidence artifact.
 */
export function createCandidateLabEvidence(input: CandidateLabEvaluationInput, candidateChangeFingerprint: string): CandidateLabEvidence {
  if (!input.candidateId.trim()) throw new Error('Candidate Lab evidence requires a candidate identifier.')
  if (!candidateChangeFingerprint.trim()) throw new Error('Candidate Lab evidence requires an exact candidate change fingerprint.')
  return Object.freeze({
    candidateId: input.candidateId,
    candidateChangeFingerprint,
    baselineCohortFingerprint: fingerprintCandidateLabCohort(input.baseline),
    candidateCohortFingerprint: fingerprintCandidateLabCohort(input.candidate),
    evaluation: evaluateCandidateLab(input),
    humanApprovalRequired: true,
    automaticPromotionAllowed: false,
  })
}

function safeFailureSummary(error: unknown): string {
  const value = error instanceof Error ? error.message : 'Candidate evaluation failed.'
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 240) || 'Candidate evaluation failed.'
}

/**
 * Executes a supplied, isolated evaluator against exactly the same fixed cases for both changes.
 * The evaluator is deliberately injected: this layer cannot select a provider, access a host
 * filesystem, or grant a sandbox capability. Any failed or malformed observation prevents
 * evidence creation and therefore prevents a promotion recommendation.
 */
export async function runCandidateLab(input: CandidateLabExecutionInput): Promise<CandidateLabExecutionResult> {
  const seen = new Set<string>()
  const failures: CandidateLabExecutionFailure[] = []
  const baseline: CandidateLabObservation[] = []
  const candidate: CandidateLabObservation[] = []
  for (const testCase of input.cases) {
    if (!testCase.caseId || seen.has(testCase.caseId)) {
      failures.push({ caseId: testCase.caseId || 'unknown', candidateChangeFingerprint: input.candidateChangeFingerprint, safeSummary: 'Candidate Lab cases must have unique non-empty identifiers.' })
      continue
    }
    seen.add(testCase.caseId)
    for (const target of [
      { fingerprint: input.baselineChangeFingerprint, observations: baseline },
      { fingerprint: input.candidateChangeFingerprint, observations: candidate },
    ]) {
      try {
        const observation = await input.evaluator.evaluate(Object.freeze({ candidateChangeFingerprint: target.fingerprint, caseId: testCase.caseId }))
        if (typeof observation.passed !== 'boolean' || typeof observation.governancePassed !== 'boolean' || Number.isNaN(normalizedScore(observation.qualityScore))) throw new Error('Candidate evaluator returned an invalid observation.')
        target.observations.push(Object.freeze({ caseId: testCase.caseId, ...observation }))
      } catch (error) {
        failures.push(Object.freeze({ caseId: testCase.caseId, candidateChangeFingerprint: target.fingerprint, safeSummary: safeFailureSummary(error) }))
      }
    }
  }
  if (failures.length) return Object.freeze({ completed: false, evidence: null, failures: Object.freeze(failures) })
  return Object.freeze({
    completed: true,
    evidence: createCandidateLabEvidence({ candidateId: input.candidateId, baseline, candidate, minimumMatchedCases: input.minimumMatchedCases }, input.candidateChangeFingerprint),
    failures: Object.freeze([]),
  })
}
