// Owner direction (2026-09-17): mass-distilled artifacts must reach independent evaluation without a hand-inserted
// canary approval each. On 2026-09-17 all 30 evaluation_pending mass artifacts had no canary, so the automatic
// evaluator (which requires a passed canary) had nothing it could run. This pure policy decides, once per cron tick,
// whether to issue ONE canary approval in exactly the shape claim_next_mass_distilled_runtime_canary accepts
// (1 invocation, <= $0.20). It never touches the claim, the canary, the evaluator, promotion or Production traffic.

import { MASS_RETENTION_DELAY_MS } from './cosUniversityMassRetentionDelay.ts'

export const MASS_CANARY_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-17_mass_canary_without_manual_intervention' as const
export const MASS_CANARY_PROFILE = 'cos_local_distilled_runtime_deploy_v1' as const
export const MASS_CANARY_APPROVAL_CLAIM = 'local_distilled_runtime_deploy_approved' as const
// Production 2026-09-25: exact canaries are healthy but the 1,000+ artifact backlog cannot drain through
// the original single-slot / 6-per-hour lane. Widen in one bounded step only: two concurrent exact canaries,
// twelve started-or-armed canaries per rolling hour, with the unchanged <= $0.20 per-canary ceiling.
// This caps nominal authority at 288 canaries/day and <= $57.60/day while preserving every artifact-local fence.
export const MASS_CANARY_ROLLING_WINDOW_HOURS = 1
export const MASS_CANARY_ROLLING_MAX_APPROVALS = 12
export const MASS_CANARY_MAX_CONCURRENT = 2
export const MASS_CANARY_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3
// A cold-start timeout is the runtime never answering, not the artifact failing. It is retried without spending one
// of the three substantive attempts, and the identical-repeat stop below still prevents an endless loop.
export const MASS_CANARY_COLD_START_FAILURE = 'the operation was aborted due to timeout' as const
export const MASS_CANARY_NO_WORKER_FAILURE = 'mass_distilled_runtime_worker_not_ready' as const
// Provider cold starts are infrastructure, not artifact quality. Yield a recently cold-start-failed
// artifact briefly so another eligible artifact can use the single canary lane; then allow retry.
export const MASS_CANARY_COLD_START_RETRY_COOLDOWN_MS = 10 * 60_000
// When a timed-out canary still has an exact provider endpoint, one short continuation may reuse that same
// endpoint/runtime identity. This catches a worker that was still booting at the readiness deadline instead of
// discarding warm progress and creating a fresh cold endpoint. A second timeout on the same runtime falls back
// to the normal ten-minute fairness cooldown. Invocation and $0.20 ceilings remain unchanged per approval.
export const MASS_CANARY_COLD_START_RESUME_COOLDOWN_MS = 60_000
export const MASS_CANARY_MAX_COLD_START_RESUMES_PER_RUNTIME = 1
export const MASS_CANARY_MAX_IDENTICAL_FAILURES = 4
// A passed canary is not permanent proof that its exact endpoint still exists or can wake. One lifecycle failure can
// be a normal cold start, but two consecutive lifecycle failures after the latest useful evaluation evidence mean the
// endpoint binding itself needs to be refreshed. Re-canary the SAME artifact before advancing the queue.
export const MASS_CANARY_ENDPOINT_REFRESH_FAILURES = 2
export const MASS_CANARY_MAX_COST_USD = 0.2
// Production 2026-09-24 17:25-19:19 UTC: the whole 3-per-hour canary lane was spent re-canarying the SAME two
// priority artifacts. Every failure they produced (worker never ready, request timeout, evaluator runtime not ready)
// is classified as infrastructure, so none counted toward the substantive-failure caps, and the priority ordering
// picked them first again after each cooldown. One artifact took 4 paid invocations in 81 minutes while ~1,100 others
// got none. Whatever the failure class, an artifact now gets at most this many canary invocations per rolling day;
// after that it yields the lane to the rest of the queue and becomes eligible again automatically a day later.
export const MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_DAY = 3
// Fairness fence: one cold runtime may receive one bounded same-runtime continuation, but it may not
// immediately consume a third paid slot while other artifacts have never had a canary. This is scoped
// to the same rolling hour as the global spend cap, so an artifact automatically becomes retryable.
export const MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_ROLLING_WINDOW = 2
export const MASS_CANARY_ARTIFACT_INVOCATION_WINDOW_MS = 24 * 60 * 60 * 1000
export const MASS_CANARY_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000
// Keep canary scheduling aligned with the independent evaluator's retention wait (one shared value, 10 minutes in
// the owner's 2026-09-28 test phase). Ordering only: it avoids spending canary slots on artifacts that are not yet
// old enough to enter evaluation while others already are.
export const MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS = MASS_RETENTION_DELAY_MS
export const MASS_CANARY_IN_FLIGHT_TTL_MS = 10 * 60 * 1000
// Owner apprenticeship proof lane (2026-09-21): the first CONFIRMED response-anchor v2
// Computer Science artifacts must not sit behind the legacy canary backlog once they are ready to prove
// themselves. Two old-recipe post-remediation CS artifacts already consumed the original date-only quota,
// leaving the first true v2 artifact behind 336 older uncanaried artifacts. Prioritize only the first two
// exact-artifact canary PASSES whose durable training receipt proves the v2 response-anchor recipe, then
// automatically return to normal oldest-first scheduling. This changes ordering only: one-canary
// concurrency, 144/day, <= $0.20 per canary, exact-artifact binding, evaluator gates, promotion rules and Production
// traffic authority are unchanged.
export const MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER = '2026-09-21T01:55:00.000Z' as const
export const MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE = 2
export const MASS_CANARY_BUILDER_V2_OPTIMIZER = 'frontier_response_anchor_then_stable_on_policy_distillation' as const
// Production 2026-09-22: the first artifact whose durable training receipt proves the post-GKD
// failure-derived replay exists, but the legacy canary backlog is hundreds deep and the older Builder
// proof cohort is already complete. Prioritize only the first two replay-proven canary passes, then
// automatically return to the existing Builder/frontier/oldest-first ordering. Scheduling only.
export const MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE = 2
// Remediation proof means the intended full corrective cohort reached the post-GKD replay. Production
// 2026-09-25 showed older 3-epoch/5e-5 artifacts with only 1-7 replay items still pinned at safety=0.500;
// those partial replays must not close the proof lane. #3231 reserves twenty variants and the worker
// partition now preserves them all in training when the batch can form an independent holdout.
export const MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS = 20
export const MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS = 3
export const MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE = 5e-5
const MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3

export type CanaryArtifact = Readonly<{
  candidateId: string
  subjectId: string
  artifactHash: string
  createdAt: string
  trainingOptimizer?: string
  frontierResponseAnchorRequired?: boolean
  frontierResponseAnchorEpochs?: number
  frontierResponseAnchorItems?: number
  failureDerivedReplayRequired?: boolean
  failureDerivedReplayItems?: number
  failureDerivedReplayEpochs?: number
  failureDerivedReplayLearningRate?: number
  attentionArchitecture?: 'standard_attention' | 'exclusive_self_attention_v1'
}>
export type CanaryEvent = Readonly<{ candidateId: string; observedAt: string; expiresAt: string | null; verifier: string; evidence: Record<string, unknown> | null }>
export type CanaryDecision =
  | Readonly<{ issue: true; artifact: CanaryArtifact; evidence: Record<string, unknown>; expiresAt: string }>
  | Readonly<{ issue: false; reason: string }>

const HEX64 = /^[a-f0-9]{64}$/i
const at = (value: string | null | undefined) => Date.parse(String(value || ''))
const MASS_CANARY_REOPEN_CLAIM = 'mass_distilled_independent_evaluation_reopened' as const
const MASS_CANARY_OWNER_FULL_RETEST_REF = 'owner_explicit_direction_2026-09-26_retest_all_quarantined' as const

function canaryGenerationStart(events: readonly CanaryEvent[], artifact: CanaryArtifact): number {
  const hash = artifact.artifactHash.toLowerCase()
  return events
    .filter(event => event.candidateId === artifact.candidateId
      && String(event.evidence?.artifactHash || '').toLowerCase() === hash
      && event.verifier === 'host_controller'
      && event.evidence?.claim === MASS_CANARY_REOPEN_CLAIM
      && event.evidence?.repairRef === MASS_CANARY_OWNER_FULL_RETEST_REF)
    .map(event => at(event.observedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] ?? Number.NEGATIVE_INFINITY
}

function forArtifact(events: readonly CanaryEvent[], artifact: CanaryArtifact): CanaryEvent[] {
  const generationStart = canaryGenerationStart(events, artifact)
  return events.filter(event => event.candidateId === artifact.candidateId
    && at(event.observedAt) >= generationStart
    && event.evidence?.profile === MASS_CANARY_PROFILE
    && String(event.evidence?.artifactHash || '').toLowerCase() === artifact.artifactHash.toLowerCase())
}

function allForArtifact(events: readonly CanaryEvent[], artifact: CanaryArtifact): CanaryEvent[] {
  const generationStart = canaryGenerationStart(events, artifact)
  return events.filter(event => event.candidateId === artifact.candidateId
    && at(event.observedAt) >= generationStart
    && String(event.evidence?.artifactHash || '').toLowerCase() === artifact.artifactHash.toLowerCase())
}

function claim(event: CanaryEvent): string { return String(event.evidence?.claim || '') }

function canaryTransientGatewayFailure(error: unknown): boolean {
  return /^http (502|503|504)(?::|$)/.test(String(error || '').trim().toLowerCase())
}

function canaryInfrastructureFailure(error: unknown): boolean {
  const normalized = String(error || '').trim().toLowerCase()
  return normalized === MASS_CANARY_COLD_START_FAILURE
    || normalized === MASS_CANARY_NO_WORKER_FAILURE
    || canaryTransientGatewayFailure(normalized)
}

/** HTTP 409 on the baseline half means the endpoint gateway is stale, not that the student failed. */
function staleGatewayModelMismatch(error: unknown): boolean {
  const normalized = String(error || '').trim().toLowerCase()
  return normalized.startsWith('mass_distilled_evaluation_runpod_http_409:baseline:')
    && (normalized.includes('distilled_exact_model_mismatch') || normalized.includes('xsa_exact_model_mismatch'))
}

function evaluationInfrastructureFailure(event: CanaryEvent): boolean {
  const error = String(event.evidence?.error || '').trim().toLowerCase()
  if (!error) return false
  return error.startsWith('mass_distilled_evaluation_context_budget_insufficient:')
    || error.includes('maximum context length is 8192 tokens')
    || error === 'the operation was aborted due to timeout'
    || error.includes('mass_distilled_evaluation_call_timeout')
    || /^mass_distilled_evaluation_runpod_http_(502|503|504):/.test(error)
    || error.startsWith('mass_distilled_evaluation_answer_missing:')
    || error.startsWith('mass_distilled_evaluation_answer_empty:')
    || (/^mass_distilled_evaluation_runpod_http_404:candidate:/.test(error)
      && error.includes('the model `itmounts-mass-distilled-')
      && error.includes('does not exist'))
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
    || staleGatewayModelMismatch(error)
    // Raised by the evaluator's age guard before any question is asked; only possible when our gates disagree
    // about the wait. Same classification as the evaluation authority.
    || error === 'mass_distilled_evaluation_retention_delay_not_met'
}

function evaluationEndpointLifecycleFailure(event: CanaryEvent): boolean {
  const error = String(event.evidence?.error || '').trim().toLowerCase()
  return staleGatewayModelMismatch(error)
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
    || (/^mass_distilled_evaluation_runpod_http_404:candidate:/.test(error)
      && error.includes('the model `itmounts-mass-distilled-')
      && error.includes('does not exist'))
}

function endpointRefreshRequired(events: readonly CanaryEvent[], artifact: CanaryArtifact): boolean {
  const own = allForArtifact(events, artifact).sort((a, b) => at(a.observedAt) - at(b.observedAt))
  const passed = [...own].reverse().find(event => claim(event) === 'local_distilled_runtime_canary_passed')
  if (!passed) return false
  const failures = own
    .filter(event => at(event.observedAt) >= at(passed.observedAt)
      && claim(event) === 'mass_distilled_independent_evaluation_failed')
    .sort((a, b) => at(b.observedAt) - at(a.observedAt))
  // A stale gateway cannot fix itself: re-canary onto a fresh endpoint after the first such 409.
  if (failures[0] && staleGatewayModelMismatch(failures[0].evidence?.error)) return true
  let consecutive = 0
  for (const failure of failures) {
    if (!evaluationEndpointLifecycleFailure(failure)) break
    consecutive += 1
  }
  return consecutive >= MASS_CANARY_ENDPOINT_REFRESH_FAILURES
}

/**
 * A passed canary hands its exact endpoint to independent evaluation. The next canary may retire
 * older mass endpoints to stay inside provider capacity, so it must not be issued while evaluation
 * still owns the current endpoint. Infrastructure failures remain retryable and therefore keep the
 * endpoint reserved, except repeated endpoint-lifecycle failures: those invalidate the stale binding
 * and re-canary the same artifact. A completed verdict, explicit suspension, or three substantive
 * failures releases it.
 */
function evaluationHandoffPending(events: readonly CanaryEvent[], artifact: CanaryArtifact): boolean {
  const own = allForArtifact(events, artifact).sort((a, b) => at(a.observedAt) - at(b.observedAt))
  const passed = [...own].reverse().find(event => claim(event) === 'local_distilled_runtime_canary_passed')
  if (!passed) return false
  if (endpointRefreshRequired(events, artifact)) return false
  const passedAt = at(passed.observedAt)
  const after = own.filter(event => at(event.observedAt) >= passedAt)
  if (after.some(event => claim(event) === 'mass_distilled_independent_evaluation_completed')) return false
  if (after.some(event => claim(event) === 'distilled_independent_evaluation_suspended')) return false
  const substantiveFailures = after.filter(event => claim(event) === 'mass_distilled_independent_evaluation_failed'
    && !evaluationInfrastructureFailure(event)).length
  return substantiveFailures < MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT
}

/** An approval is still armed while unexpired, not yet invoked, and under the claim's three preflight failures. */
function armedApproval(own: readonly CanaryEvent[], nowMs: number): boolean {
  return own.some(approval => {
    if (approval.verifier !== 'host_controller' || claim(approval) !== MASS_CANARY_APPROVAL_CLAIM) return false
    const approvedAt = at(approval.observedAt)
    if (!Number.isFinite(approvedAt) || !(at(approval.expiresAt) > nowMs)) return false
    // A rolling approval accidentally re-issued after this exact artifact already passed its canary
    // cannot be consumed: the atomic claim correctly refuses a second canary. Treat that duplicate
    // approval as stale unless it explicitly carries the endpoint-refresh authority produced after
    // repeated evaluator lifecycle failures. Otherwise one bad approval becomes a queue-wide deadlock.
    const alreadyPassed = own.some(event => claim(event) === 'local_distilled_runtime_canary_passed'
      && at(event.observedAt) <= approvedAt)
    if (alreadyPassed && approval.evidence?.endpointRefresh !== true) return false
    const after = own.filter(event => at(event.observedAt) >= approvedAt)
    if (after.some(event => claim(event) === 'local_distilled_runtime_canary_invocation_started')) return false
    return after.filter(event => claim(event) === 'local_distilled_runtime_canary_preflight_failed').length < 3
  })
}

/**
 * Once the paid/model invocation has started, the approval is intentionally no longer "armed", but the
 * canary still owns the single global runtime slot until a terminal pass/fail is durably recorded.
 * Without this second semaphore window the next cron tick can approve the same artifact again while its
 * first canary is still running, creating duplicate endpoints and duplicate spend. A bounded TTL prevents
 * an orphaned invocation marker from freezing the queue forever after a process crash.
 */
function canaryInvocationInFlight(own: readonly CanaryEvent[], nowMs: number): boolean {
  const starts = own
    .filter(event => claim(event) === 'local_distilled_runtime_canary_invocation_started')
    .sort((a, b) => at(b.observedAt) - at(a.observedAt))
  const latest = starts[0]
  if (!latest) return false
  const startedAt = at(latest.observedAt)
  if (!Number.isFinite(startedAt) || nowMs - startedAt >= MASS_CANARY_IN_FLIGHT_TTL_MS) return false
  return !own.some(event => at(event.observedAt) >= startedAt
    && ['local_distilled_runtime_canary_passed', 'local_distilled_runtime_canary_failed'].includes(claim(event)))
}

export function decideMassCanaryRollingApproval(input: {
  artifacts: readonly CanaryArtifact[]
  events: readonly CanaryEvent[]
  now: Date
  enabled: boolean
  builderProofPasses?: number
  remediationReplayProofPasses?: number
}): CanaryDecision {
  if (!input.enabled) return { issue: false, reason: 'mass_canary_rolling_authorization_disabled' }
  const nowMs = input.now.getTime()

  const valid = input.artifacts
    .filter(artifact => artifact.candidateId.startsWith('mass:') && HEX64.test(artifact.artifactHash) && artifact.subjectId)

  // Budget the rolling window by provider invocations that actually started, plus any currently
  // armed approval that can still become one. Expired approvals that were never invoked consumed
  // neither provider work nor canary spend and therefore must not create an artificial blackout.
  // This bounds maximum potential spend: at most twelve started-or-still-reserved canaries
  // per rolling hour, each already bounded to <= $0.20 by the approval contract.
  const rollingWindowStart = nowMs - MASS_CANARY_ROLLING_WINDOW_HOURS * 3600_000
  const invokedInWindow = input.events.filter(event => event.verifier === 'host_controller'
    && claim(event) === 'local_distilled_runtime_canary_invocation_started'
    && event.evidence?.profile === MASS_CANARY_PROFILE
    && at(event.observedAt) > rollingWindowStart).length
  const armedReservations = valid.filter(artifact => armedApproval(forArtifact(input.events, artifact), nowMs)).length
  if (invokedInWindow + armedReservations >= MASS_CANARY_ROLLING_MAX_APPROVALS) {
    return { issue: false, reason: 'mass_canary_rolling_window_exhausted' }
  }

  const builderProofArtifact = (artifact: CanaryArtifact) =>
    artifact.subjectId === 'Computer Science & Coding'
      && at(artifact.createdAt) >= at(MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER)
      && artifact.trainingOptimizer === MASS_CANARY_BUILDER_V2_OPTIMIZER
      && artifact.frontierResponseAnchorRequired === true
      && artifact.frontierResponseAnchorEpochs === 1
      && Number(artifact.frontierResponseAnchorItems) > 0

  const builderProofPasses = Number.isFinite(Number(input.builderProofPasses))
    ? Math.max(0, Math.floor(Number(input.builderProofPasses)))
    : new Set(valid
      .filter(builderProofArtifact)
      .filter(artifact => forArtifact(input.events, artifact).some(event => claim(event) === 'local_distilled_runtime_canary_passed'))
      .map(artifact => artifact.candidateId)).size
  const builderProofNeeded = builderProofPasses < MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE

  const replayProofArtifact = (artifact: CanaryArtifact) =>
    artifact.failureDerivedReplayRequired === true
      && Number(artifact.failureDerivedReplayItems) >= MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS
      && Number(artifact.failureDerivedReplayEpochs) >= MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS
      && Number(artifact.failureDerivedReplayLearningRate) >= MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE
  const replayProofPasses = Number.isFinite(Number(input.remediationReplayProofPasses))
    ? Math.max(0, Math.floor(Number(input.remediationReplayProofPasses)))
    : new Set(valid
      .filter(replayProofArtifact)
      .filter(artifact => forArtifact(input.events, artifact).some(event => claim(event) === 'local_distilled_runtime_canary_passed'))
      .map(artifact => artifact.candidateId)).size
  const replayProofNeeded = replayProofPasses < MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE

  const xsaProofArtifact = (artifact: CanaryArtifact) =>
    artifact.attentionArchitecture === 'exclusive_self_attention_v1'

  const currentRecipeArtifact = (artifact: CanaryArtifact) =>
    artifact.trainingOptimizer === MASS_CANARY_BUILDER_V2_OPTIMIZER
      && artifact.frontierResponseAnchorRequired === true
      && Number(artifact.frontierResponseAnchorEpochs) === 1
      && Number(artifact.frontierResponseAnchorItems) > 0

  valid.sort((a, b) => {
    // Preserve the established Builder apprenticeship priority whenever that cohort is unfinished.
    if (builderProofNeeded) {
      const aBuilder = builderProofArtifact(a)
      const bBuilder = builderProofArtifact(b)
      if (aBuilder !== bBuilder) return aBuilder ? -1 : 1
    }
    // Once Builder proof is satisfied, give the first two post-GKD remediation-replay artifacts a
    // bounded proof lane ahead of the legacy backlog. The 6/hour canary cap and all other authority remain unchanged.
    if (replayProofNeeded) {
      const aReplay = replayProofArtifact(a)
      const bReplay = replayProofArtifact(b)
      if (aReplay !== bReplay) return aReplay ? -1 : 1
      // Builder apprenticeship still needs a qualifying Computer Science graduate. Once replay
      // remediation exists, prove one replay-trained CS artifact before spending the bounded
      // two-artifact proof cohort entirely on other subjects. Ordering only; all gates remain.
      if (aReplay && bReplay) {
        const aComputerScience = a.subjectId === 'Computer Science & Coding'
        const bComputerScience = b.subjectId === 'Computer Science & Coding'
        if (aComputerScience !== bComputerScience) return aComputerScience ? -1 : 1
        const aEvaluationReady = nowMs - at(a.createdAt) >= MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS
        const bEvaluationReady = nowMs - at(b.createdAt) >= MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS
        if (aEvaluationReady !== bEvaluationReady) return aEvaluationReady ? -1 : 1
        const newestReplayFirst = at(b.createdAt) - at(a.createdAt)
        if (newestReplayFirst !== 0) return newestReplayFirst
      }
    }
    // XSA is a separate architecture experiment whose exact-artifact runtime is now Production-bound.
    // Give XSA-trained artifacts a proof slot ahead of the general recipe backlog so architecture
    // certification cannot be starved by ordinary canaries. Ordering only; all global/per-artifact
    // invocation, spend, concurrency, evaluation, rollback, and Production-traffic gates remain unchanged.
    const aXsa = xsaProofArtifact(a)
    const bXsa = xsaProofArtifact(b)
    if (aXsa !== bXsa) return aXsa ? -1 : 1

    // After bounded proof cohorts, prefer the recipe current training actually emits. Legacy artifacts
    // remain eligible as fallback; they simply no longer consume the front of the paid canary queue while
    // hundreds of anchored artifacts wait behind a 0-for-122 old-recipe quality cohort.
    const aCurrent = currentRecipeArtifact(a)
    const bCurrent = currentRecipeArtifact(b)
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
    if (aCurrent && bCurrent) {
      const aEvaluationReady = nowMs - at(a.createdAt) >= MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS
      const bEvaluationReady = nowMs - at(b.createdAt) >= MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS
      if (aEvaluationReady !== bEvaluationReady) return aEvaluationReady ? -1 : 1
      const newestCurrentRecipeFirst = at(b.createdAt) - at(a.createdAt)
      if (newestCurrentRecipeFirst !== 0) return newestCurrentRecipeFirst
    }
    return at(a.createdAt) - at(b.createdAt) || a.candidateId.localeCompare(b.candidateId)
  })

  // Queue-wide semaphore has two phases per artifact: an unconsumed approval, then the actual
  // in-flight canary invocation. Count distinct active candidates and admit at most two. The atomic SQL
  // claim serializes reservation creation, while this policy prevents approval issuance from outrunning
  // the bounded RunPod concurrency envelope.
  const activeCanaryCandidates = new Set(valid
    .filter(artifact => {
      const own = forArtifact(input.events, artifact)
      return armedApproval(own, nowMs) || canaryInvocationInFlight(own, nowMs)
    })
    .map(artifact => artifact.candidateId))
  if (activeCanaryCandidates.size >= MASS_CANARY_MAX_CONCURRENT) {
    return { issue: false, reason: 'mass_canary_concurrency_exhausted' }
  }

  // Awaiting independent evaluation is an ARTIFACT-LOCAL lifecycle condition and is excluded per
  // artifact inside the loop below, not queue-wide. Production 2026-09-19 showed why: six artifacts
  // had passed their canary and were waiting for evaluation, and the previous queue-wide
  // `some(evaluationHandoffPending) -> return` turned that into a deadlock which left 45 aged
  // artifacts with no canary attempt at all. Once a canary's evidence is durably captured, that
  // artifact no longer owns the canary semaphore; the armed-approval check above still guarantees a
  // single canary in flight.

  for (const artifact of valid) {
    const own = forArtifact(input.events, artifact).sort((a, b) => at(a.observedAt) - at(b.observedAt))
    // An artifact that already owns one of the bounded slots must not receive another approval.
    if (armedApproval(own, nowMs) || canaryInvocationInFlight(own, nowMs)) continue
    // Artifact-local: this one is done canarying and is waiting on the evaluator. Skip it and keep
    // searching the queue rather than stopping the whole issuer.
    if (evaluationHandoffPending(input.events, artifact)) continue
    // Per-artifact ceilings are independent of failure classification. The daily fence bounds total
    // spend; the rolling-hour fence prevents one infrastructure-failing runtime from monopolizing the
    // global twelve-slot window while untouched artifacts wait behind it.
    const invocationStarts = own.filter(event => claim(event) === 'local_distilled_runtime_canary_invocation_started')
    const invocationsToday = invocationStarts
      .filter(event => nowMs - at(event.observedAt) < MASS_CANARY_ARTIFACT_INVOCATION_WINDOW_MS).length
    if (invocationsToday >= MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_DAY) continue
    const invocationsThisRollingWindow = invocationStarts
      .filter(event => at(event.observedAt) > rollingWindowStart).length
    if (invocationsThisRollingWindow >= MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_ROLLING_WINDOW) continue
    const refreshEndpoint = endpointRefreshRequired(input.events, artifact)
    if (own.some(event => claim(event) === 'local_distilled_runtime_canary_passed') && !refreshEndpoint) continue
    const latestControl = [...own].reverse().find(event => event.verifier === 'host_controller'
      && [MASS_CANARY_APPROVAL_CLAIM, 'local_distilled_runtime_canary_suspended'].includes(claim(event)))
    if (latestControl && claim(latestControl) === 'local_distilled_runtime_canary_suspended') continue
    const firstRolling = own.find(event => claim(event) === MASS_CANARY_APPROVAL_CLAIM
      && event.evidence?.authorizationRef === MASS_CANARY_ROLLING_AUTHORIZATION_REF)
    const failures = firstRolling
      ? own.filter(event => at(event.observedAt) >= at(firstRolling.observedAt)
        && claim(event) === 'local_distilled_runtime_canary_failed'
        && !canaryInfrastructureFailure(event.evidence?.error)).length
      : 0
    if (failures >= MASS_CANARY_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue

    const failureEvents = own
      .filter(event => claim(event) === 'local_distilled_runtime_canary_failed')
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    const newestFailure = failureEvents[0]
    const newestFailureError = String(newestFailure?.evidence?.error || '').trim().toLowerCase()

    // A cold-start timeout is infrastructure, not artifact quality. If the provider did create an exact
    // endpoint/runtime, allow one short continuation on that SAME runtime so a still-booting worker is not
    // thrown away. After one timeout on that runtime, return to the longer fairness cooldown.
    const newestFailureEndpointId = String(newestFailure?.evidence?.endpointId || '').trim()
    const newestFailureRuntimeKey = String(newestFailure?.evidence?.runtimeKey || '').trim().toLowerCase()
    // Production 2026-09-24 19:31-19:55 UTC: three consecutive canaries ended in no-worker failures while RunPod
    // still reported a worker INITIALIZING on the exact endpoint. Discarding that endpoint and creating a fresh one
    // restarts the whole cold boot (image + model load) every time, so the boot can never finish inside one
    // attempt. A no-worker failure whose recorded provider health still shows an initializing worker is therefore
    // resumable on the same endpoint, exactly like a request timeout. A no-worker failure with no worker at all
    // (no GPU allocated) keeps the old behaviour: yield, cool down, and derive a fresh runtime later.
    const newestFailureWorkers = (newestFailure?.evidence as any)?.healthAfter?.workers || {}
    const newestFailureWorkerInitializing = Number(newestFailureWorkers?.initializing ?? 0) > 0
    const newestFailureWorkerPresent = ['idle','ready','running','initializing']
      .some(key => Number(newestFailureWorkers?.[key] ?? 0) > 0)
    const resumableColdStart = (newestFailureError === MASS_CANARY_COLD_START_FAILURE
        || (newestFailureError === MASS_CANARY_NO_WORKER_FAILURE && newestFailureWorkerInitializing)
        || (canaryTransientGatewayFailure(newestFailureError) && newestFailureWorkerPresent))
      && /^[a-z0-9_-]{3,120}$/i.test(newestFailureEndpointId)
      && /^[a-z0-9]{10}$/.test(newestFailureRuntimeKey)
    const coldStartResumeCount = resumableColdStart
      ? failureEvents.filter(event =>
          canaryInfrastructureFailure(event.evidence?.error)
          && String(event.evidence?.runtimeKey || '').trim().toLowerCase() === newestFailureRuntimeKey).length
      : 0
    const coldStartResumeAllowed = resumableColdStart
      && coldStartResumeCount <= MASS_CANARY_MAX_COLD_START_RESUMES_PER_RUNTIME
    if (canaryInfrastructureFailure(newestFailureError)) {
      const newestFailureAt = at(newestFailure?.observedAt)
      // A request-timeout or transient RunPod 502/503/504 with a still-present worker may get one short
      // continuation on the exact same runtime. A no-worker failure with no provider worker proves RunPod
      // never allocated usable compute, so never pin the next attempt to that dead endpoint: yield it for
      // the normal fairness cooldown and let a later approval derive a fresh runtime identity.
      const cooldown = coldStartResumeAllowed
        ? MASS_CANARY_COLD_START_RESUME_COOLDOWN_MS
        : MASS_CANARY_COLD_START_RETRY_COOLDOWN_MS
      if (!Number.isFinite(newestFailureAt) || nowMs - newestFailureAt < cooldown) continue
    }

    // Consecutive identical substantive failures are a stuck artifact. Provider cold-start/no-worker
    // failures never become artifact-quality evidence or a permanent identical-error stop.
    const errors = failureEvents.map(event => String(event.evidence?.error || '').trim().toLowerCase())
    if (errors.length && !canaryInfrastructureFailure(errors[0])) {
      let identical = 0
      for (const error of errors) {
        if (error !== errors[0]) break
        identical += 1
      }
      if (identical >= MASS_CANARY_MAX_IDENTICAL_FAILURES) continue
    }

    return {
      issue: true,
      artifact,
      expiresAt: new Date(nowMs + MASS_CANARY_APPROVAL_TTL_MS).toISOString(),
      evidence: {
        profile: MASS_CANARY_PROFILE,
        claim: MASS_CANARY_APPROVAL_CLAIM,
        candidateId: artifact.candidateId,
        artifactHash: artifact.artifactHash.toLowerCase(),
        canaryAuthorized: true,
        maxCanaryInvocations: 1,
        maxEstimatedCanaryCostUsd: MASS_CANARY_MAX_COST_USD,
        productionTrafficAuthorized: false,
        automaticPromotionAuthorized: false,
        authorityExpanded: false,
        authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF,
        ...(coldStartResumeAllowed ? {
          coldStartResume: true,
          coldStartResumeEndpointId: newestFailureEndpointId,
          coldStartResumeRuntimeKey: newestFailureRuntimeKey,
        } : {}),
        ...(replayProofNeeded && replayProofArtifact(artifact) ? { remediationReplayProofPriority: true } : {}),
        ...(xsaProofArtifact(artifact) ? { xsaArchitectureProofPriority: true } : {}),
        ...(currentRecipeArtifact(artifact) ? {
          currentRecipePriority: true,
          evaluationAgeReadyPriority: nowMs - at(artifact.createdAt) >= MASS_CANARY_EVALUATION_ELIGIBILITY_DELAY_MS,
        } : {}),
        ...(refreshEndpoint ? { endpointRefresh: true, endpointRefreshReason: 'repeated_evaluation_endpoint_lifecycle_failure' } : {}),
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_canary' }
