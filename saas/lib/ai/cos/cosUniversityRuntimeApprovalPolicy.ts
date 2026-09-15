// saas/lib/ai/cos/cosUniversityRuntimeApprovalPolicy.ts
// Pure policy for owner-issued runtime approvals. No imports, no I/O, so it is testable in isolation.
// The evidence shape here is the exact shape both distilled-evaluation matchers accept
// (app/api/cron/cos-university-distilled-evaluation/route.ts and cosUniversityDistilledArtifactEvaluation.ts).
// Hand-written approval SQL drifted from that shape, raced cron ticks and was silently dropped;
// this module is the single source of the shape so the owner never types it again.

export const DISTILLED_EVALUATION_APPROVAL_PROFILE = 'cos_distilled_independent_evaluation_authorization_v1' as const
export const DISTILLED_EVALUATION_APPROVAL_CLAIM = 'distilled_independent_evaluation_approved' as const
export const DISTILLED_EVALUATION_ATTEMPT_CLAIM = 'distilled_independent_evaluation_attempt_started' as const
export const DISTILLED_EVALUATION_PATH_ID = 'distilled_independent_evaluation' as const
export const DISTILLED_EVALUATION_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000
export const DISTILLED_EVALUATION_TICK_MINUTES = 10
export const DISTILLED_EVALUATION_TICK_CLEARANCE_MS = 75_000
export const DISTILLED_EVALUATION_MIN_RUNTIME_WAKE_COST_USD = ((570 + 60) * 0.69) / 3600
export const DISTILLED_EVALUATION_MAX_BATCH_CASES = 12
export const DISTILLED_EVALUATION_MAX_HOLDOUT_CASES = 60
export const DISTILLED_EVALUATION_STATIC_SUITE_COUNT = 3
export const DISTILLED_EVALUATION_MAX_SOLO_RETRY_CALLS = 2
export const DISTILLED_EVALUATION_RETENTION_DELAY_MS = 12 * 60 * 60 * 1000
export const DISTILLED_EVALUATOR_VERSION = 'cos-distilled-exact-artifact-evaluator-v4' as const

const HEX64 = /^[a-f0-9]{64}$/

export type DistilledEvaluationApprovalEvidence = Readonly<{
  profile: typeof DISTILLED_EVALUATION_APPROVAL_PROFILE
  claim: typeof DISTILLED_EVALUATION_APPROVAL_CLAIM
  candidateId: string
  artifactHash: string
  holdoutCaseCount: number
  evaluationAuthorized: true
  maxEndpointCalls: number
  maxJudgeCalls: number
  maxSoloRetryCalls: typeof DISTILLED_EVALUATION_MAX_SOLO_RETRY_CALLS
  maxRuntimeWakeAttempts: 1
  maxEstimatedRuntimeWakeCostUsd: 0.2
  productionTrafficAuthorized: false
  authorityExpanded: false
  issuedBy: 'owner_runtime_approval_surface'
}>

export type DistilledEvaluationCallCeilings = Readonly<{
  holdoutCaseCount: number
  maxEndpointCalls: number
  maxJudgeCalls: number
  maxSoloRetryCalls: typeof DISTILLED_EVALUATION_MAX_SOLO_RETRY_CALLS
}>

export function distilledEvaluationCallCeilings(holdoutCaseCountInput: number): DistilledEvaluationCallCeilings {
  const holdoutCaseCount = Number(holdoutCaseCountInput)
  if (!Number.isInteger(holdoutCaseCount) || holdoutCaseCount < 1 || holdoutCaseCount > DISTILLED_EVALUATION_MAX_HOLDOUT_CASES) {
    throw new Error('runtime_approval_holdout_case_count_invalid')
  }
  const maxJudgeCalls = Math.ceil(holdoutCaseCount / DISTILLED_EVALUATION_MAX_BATCH_CASES)
    + DISTILLED_EVALUATION_STATIC_SUITE_COUNT
  return Object.freeze({
    holdoutCaseCount,
    maxEndpointCalls: (maxJudgeCalls * 2) + DISTILLED_EVALUATION_MAX_SOLO_RETRY_CALLS,
    maxJudgeCalls,
    maxSoloRetryCalls: DISTILLED_EVALUATION_MAX_SOLO_RETRY_CALLS,
  })
}

export function buildDistilledEvaluationApproval(input: { candidateId: string; artifactHash: string; holdoutCaseCount: number }): DistilledEvaluationApprovalEvidence {
  const candidateId = String(input.candidateId || '').trim()
  const artifactHash = String(input.artifactHash || '').trim().toLowerCase()
  if (!candidateId) throw new Error('runtime_approval_candidate_missing')
  if (!HEX64.test(artifactHash)) throw new Error('runtime_approval_artifact_hash_invalid')
  const calls = distilledEvaluationCallCeilings(input.holdoutCaseCount)
  return Object.freeze({
    profile: DISTILLED_EVALUATION_APPROVAL_PROFILE,
    claim: DISTILLED_EVALUATION_APPROVAL_CLAIM,
    candidateId,
    artifactHash,
    holdoutCaseCount: calls.holdoutCaseCount,
    evaluationAuthorized: true,
    maxEndpointCalls: calls.maxEndpointCalls,
    maxJudgeCalls: calls.maxJudgeCalls,
    maxSoloRetryCalls: calls.maxSoloRetryCalls,
    maxRuntimeWakeAttempts: 1,
    maxEstimatedRuntimeWakeCostUsd: 0.2,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
    issuedBy: 'owner_runtime_approval_surface',
  })
}

/** Accept only approvals that the stricter runtime-attempt matcher can actually consume. */
export function isDistilledEvaluationApprovalEvidence(
  value: unknown,
  identity: { candidateId: string; artifactHash: string; holdoutCaseCount?: number },
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const evidence = value as Record<string, unknown>
  let calls: DistilledEvaluationCallCeilings
  try {
    calls = distilledEvaluationCallCeilings(Number(evidence.holdoutCaseCount))
  } catch {
    return false
  }
  return evidence.profile === DISTILLED_EVALUATION_APPROVAL_PROFILE
    && evidence.claim === DISTILLED_EVALUATION_APPROVAL_CLAIM
    && evidence.candidateId === identity.candidateId
    && String(evidence.artifactHash || '').toLowerCase() === identity.artifactHash.toLowerCase()
    && (identity.holdoutCaseCount === undefined || calls.holdoutCaseCount === identity.holdoutCaseCount)
    && evidence.evaluationAuthorized === true
    && Number(evidence.maxEndpointCalls) === calls.maxEndpointCalls
    && Number(evidence.maxJudgeCalls) === calls.maxJudgeCalls
    && Number(evidence.maxSoloRetryCalls) === calls.maxSoloRetryCalls
    && Number(evidence.maxRuntimeWakeAttempts) === 1
    && Number(evidence.maxEstimatedRuntimeWakeCostUsd) >= DISTILLED_EVALUATION_MIN_RUNTIME_WAKE_COST_USD
    && Number(evidence.maxEstimatedRuntimeWakeCostUsd) <= 0.2
    && evidence.productionTrafficAuthorized === false
    && evidence.authorityExpanded === false
    && evidence.issuedBy === 'owner_runtime_approval_surface'
}

/**
 * Refuse to issue inside the clearance window before the next evaluator tick. A write that lands
 * seconds before a tick can miss that tick's read and waste a cycle; waiting ~1 minute is cheaper.
 */
export function tickClearance(now: Date, tickMinutes = DISTILLED_EVALUATION_TICK_MINUTES, clearanceMs = DISTILLED_EVALUATION_TICK_CLEARANCE_MS) {
  const periodMs = tickMinutes * 60_000
  const nowMs = now.getTime()
  const nextTickMs = Math.floor(nowMs / periodMs) * periodMs + periodMs
  const untilTickMs = nextTickMs - nowMs
  if (untilTickMs < clearanceMs) {
    return { ok: false as const, retryAfterSeconds: Math.ceil((untilTickMs + 5_000) / 1000), nextTickAt: new Date(nextTickMs).toISOString() }
  }
  return { ok: true as const, retryAfterSeconds: 0, nextTickAt: new Date(nextTickMs).toISOString() }
}

export type ApprovalRow = Readonly<{ observed_at: string; expires_at: string | null; evidence: Record<string, unknown> | null }>
export type AttemptRow = Readonly<{ evidence: Record<string, unknown> | null }>

export type ApprovalState = 'none' | 'armed' | 'consumed' | 'expired'

/** Approval state for the newest approval of this candidate/artifact. */
export function approvalState(input: { approval: ApprovalRow | null; attempts: readonly AttemptRow[]; now: Date }): ApprovalState {
  if (!input.approval) return 'none'
  const observedMs = Date.parse(String(input.approval.observed_at || ''))
  if (!Number.isFinite(observedMs) || observedMs > input.now.getTime()) return 'none'
  const consumed = input.attempts.some(row => {
    const at = Date.parse(String(row.evidence?.authorizationObservedAt || ''))
    return Number.isFinite(at) && Number.isFinite(observedMs) && at === observedMs
  })
  if (consumed) return 'consumed'
  const expiresMs = Date.parse(String(input.approval.expires_at || ''))
  if (!Number.isFinite(expiresMs) || expiresMs <= input.now.getTime()) return 'expired'
  return 'armed'
}

export type IndependentEvaluationRow = Readonly<{
  observed_at: string
  evidence: Record<string, unknown> | null
}>

export type SavedEvaluationTimingRow = Readonly<{
  artifact_age_seconds: number
  delayed_retention_passed: boolean
  created_at: string
}>

/** A legacy evaluation that ran before delayed retention became eligible may resume retention only. */
export function delayedRetentionRecovery(
  row: SavedEvaluationTimingRow | null,
  now: Date,
): Readonly<{ ready: boolean; readyAt: string; retryAfterSeconds: number }> | null {
  if (!row || row.delayed_retention_passed !== false) return null
  const ageSeconds = Number(row.artifact_age_seconds)
  const evaluatedAt = Date.parse(String(row.created_at || ''))
  if (!Number.isSafeInteger(ageSeconds) || ageSeconds < 0
    || ageSeconds * 1000 >= DISTILLED_EVALUATION_RETENTION_DELAY_MS
    || !Number.isFinite(evaluatedAt)) return null
  const readyAtMs = evaluatedAt - ageSeconds * 1000 + DISTILLED_EVALUATION_RETENTION_DELAY_MS
  const retryAfterSeconds = Math.max(0, Math.ceil((readyAtMs - now.getTime()) / 1000))
  return Object.freeze({
    ready: retryAfterSeconds === 0,
    readyAt: new Date(readyAtMs).toISOString(),
    retryAfterSeconds,
  })
}

/**
 * One independent verdict per artifact. Once the independent scorer has recorded an evaluation for
 * this exact artifact hash, another attempt cannot change the model — it can only re-roll the score.
 * Re-running to fish for a different verdict weakens the evaluator, so issuance is refused.
 */
export function completedIndependentEvaluation(rows: readonly IndependentEvaluationRow[], artifactHash: string) {
  const target = String(artifactHash || '').trim().toLowerCase()
  const row = rows.find(item => item?.evidence?.claim === 'independent_evaluation'
    && String(item?.evidence?.artifactHash || '').toLowerCase() === target)
  if (!row) return null
  const baseline = Number(row.evidence?.baselineScore)
  const student = Number(row.evidence?.trainedArtifactScore)
  return {
    observedAt: String(row.observed_at || ''),
    baselineScore: Number.isFinite(baseline) ? baseline : null,
    trainedArtifactScore: Number.isFinite(student) ? student : null,
    improved: Number.isFinite(baseline) && Number.isFinite(student) && student > baseline,
  }
}
