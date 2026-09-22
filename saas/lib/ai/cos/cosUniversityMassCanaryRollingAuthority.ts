// saas/lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts
// Owner direction (2026-09-17): mass-distilled artifacts must reach independent evaluation without a hand-inserted
// canary approval each. On 2026-09-17 all 30 evaluation_pending mass artifacts had no canary, so the automatic
// evaluator (which requires a passed canary) had nothing it could run. This pure policy decides, once per cron tick,
// whether to issue ONE canary approval in exactly the shape claim_next_mass_distilled_runtime_canary accepts
// (1 invocation, <= $0.20). It never touches the claim, the canary, the evaluator, promotion or Production traffic.

export const MASS_CANARY_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-17_mass_canary_without_manual_intervention' as const
export const MASS_CANARY_PROFILE = 'cos_local_distilled_runtime_deploy_v1' as const
export const MASS_CANARY_APPROVAL_CLAIM = 'local_distilled_runtime_deploy_approved' as const
// Smooth the same 72/day owner spend envelope across four 6-hour windows. A bursty 24-hour
// counter allowed 98 historical approvals to leave the canary lane dark for ~16 hours even though
// the one-canary semaphore and <= $0.20 per-canary ceiling were healthy. 18 per 6 hours preserves
// the same nominal worst-case rate (72/day, <= $14.40/day) without a long post-burst blackout.
export const MASS_CANARY_ROLLING_WINDOW_HOURS = 6
export const MASS_CANARY_ROLLING_MAX_APPROVALS = 18
export const MASS_CANARY_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3
// A cold-start timeout is the runtime never answering, not the artifact failing. It is retried without spending one
// of the three substantive attempts, and the identical-repeat stop below still prevents an endless loop.
export const MASS_CANARY_COLD_START_FAILURE = 'the operation was aborted due to timeout' as const
export const MASS_CANARY_MAX_IDENTICAL_FAILURES = 4
// A passed canary is not permanent proof that its exact endpoint still exists or can wake. One lifecycle failure can
// be a normal cold start, but two consecutive lifecycle failures after the latest useful evaluation evidence mean the
// endpoint binding itself needs to be refreshed. Re-canary the SAME artifact before advancing the queue.
export const MASS_CANARY_ENDPOINT_REFRESH_FAILURES = 2
export const MASS_CANARY_MAX_COST_USD = 0.2
export const MASS_CANARY_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000
export const MASS_CANARY_IN_FLIGHT_TTL_MS = 10 * 60 * 1000
// Owner apprenticeship proof lane (2026-09-21): the first CONFIRMED response-anchor v2
// Computer Science artifacts must not sit behind the legacy canary backlog once they are ready to prove
// themselves. Two old-recipe post-remediation CS artifacts already consumed the original date-only quota,
// leaving the first true v2 artifact behind 336 older uncanaried artifacts. Prioritize only the first two
// exact-artifact canary PASSES whose durable training receipt proves the v2 response-anchor recipe, then
// automatically return to normal oldest-first scheduling. This changes ordering only: one-canary
// concurrency, 72/day, <= $0.20, exact-artifact binding, evaluator gates, promotion rules and Production
// traffic authority are unchanged.
export const MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER = '2026-09-21T01:55:00.000Z' as const
export const MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE = 2
export const MASS_CANARY_BUILDER_V2_OPTIMIZER = 'frontier_response_anchor_then_stable_on_policy_distillation' as const
// Production 2026-09-22: the first artifact whose durable training receipt proves the post-GKD
// failure-derived replay exists, but the legacy canary backlog is hundreds deep and the older Builder
// proof cohort is already complete. Prioritize only the first two replay-proven canary passes, then
// automatically return to the existing Builder/frontier/oldest-first ordering. Scheduling only.
export const MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE = 2
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
}>
export type CanaryEvent = Readonly<{ candidateId: string; observedAt: string; expiresAt: string | null; verifier: string; evidence: Record<string, unknown> | null }>
export type CanaryDecision =
  | Readonly<{ issue: true; artifact: CanaryArtifact; evidence: Record<string, unknown>; expiresAt: string }>
  | Readonly<{ issue: false; reason: string }>

const HEX64 = /^[a-f0-9]{64}$/i
const at = (value: string | null | undefined) => Date.parse(String(value || ''))

function forArtifact(events: readonly CanaryEvent[], artifact: CanaryArtifact): CanaryEvent[] {
  return events.filter(event => event.candidateId === artifact.candidateId
    && event.evidence?.profile === MASS_CANARY_PROFILE
    && String(event.evidence?.artifactHash || '').toLowerCase() === artifact.artifactHash.toLowerCase())
}

function allForArtifact(events: readonly CanaryEvent[], artifact: CanaryArtifact): CanaryEvent[] {
  return events.filter(event => event.candidateId === artifact.candidateId
    && String(event.evidence?.artifactHash || '').toLowerCase() === artifact.artifactHash.toLowerCase())
}

function claim(event: CanaryEvent): string { return String(event.evidence?.claim || '') }

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
}

function evaluationEndpointLifecycleFailure(event: CanaryEvent): boolean {
  const error = String(event.evidence?.error || '').trim().toLowerCase()
  return error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
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

  const issuedInWindow = input.events.filter(event => event.verifier === 'host_controller'
    && claim(event) === MASS_CANARY_APPROVAL_CLAIM
    && event.evidence?.authorizationRef === MASS_CANARY_ROLLING_AUTHORIZATION_REF
    && at(event.observedAt) > nowMs - MASS_CANARY_ROLLING_WINDOW_HOURS * 3600_000).length
  if (issuedInWindow >= MASS_CANARY_ROLLING_MAX_APPROVALS) return { issue: false, reason: 'mass_canary_rolling_window_exhausted' }

  const valid = input.artifacts
    .filter(artifact => artifact.candidateId.startsWith('mass:') && HEX64.test(artifact.artifactHash) && artifact.subjectId)

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
      && Number(artifact.failureDerivedReplayItems) > 0
  const replayProofPasses = Number.isFinite(Number(input.remediationReplayProofPasses))
    ? Math.max(0, Math.floor(Number(input.remediationReplayProofPasses)))
    : new Set(valid
      .filter(replayProofArtifact)
      .filter(artifact => forArtifact(input.events, artifact).some(event => claim(event) === 'local_distilled_runtime_canary_passed'))
      .map(artifact => artifact.candidateId)).size
  const replayProofNeeded = replayProofPasses < MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE

  valid.sort((a, b) => {
    // Preserve the established Builder apprenticeship priority whenever that cohort is unfinished.
    if (builderProofNeeded) {
      const aBuilder = builderProofArtifact(a)
      const bBuilder = builderProofArtifact(b)
      if (aBuilder !== bBuilder) return aBuilder ? -1 : 1
    }
    // Once Builder proof is satisfied, give the first two post-GKD remediation-replay artifacts a
    // bounded proof lane ahead of the legacy backlog. The 18/6h canary cap and all other authority remain unchanged.
    if (replayProofNeeded) {
      const aReplay = replayProofArtifact(a)
      const bReplay = replayProofArtifact(b)
      if (aReplay !== bReplay) return aReplay ? -1 : 1
    }
    return at(a.createdAt) - at(b.createdAt) || a.candidateId.localeCompare(b.candidateId)
  })

  // Queue-wide semaphore has two phases: an unconsumed approval, then the actual in-flight canary
  // invocation. The second phase matters because the approval ceases to be armed as soon as invocation starts.
  if (valid.some(artifact => armedApproval(forArtifact(input.events, artifact), nowMs))) {
    return { issue: false, reason: 'mass_canary_approval_already_armed' }
  }
  if (valid.some(artifact => canaryInvocationInFlight(forArtifact(input.events, artifact), nowMs))) {
    return { issue: false, reason: 'mass_canary_invocation_already_in_flight' }
  }

  // Awaiting independent evaluation is an ARTIFACT-LOCAL lifecycle condition and is excluded per
  // artifact inside the loop below, not queue-wide. Production 2026-09-19 showed why: six artifacts
  // had passed their canary and were waiting for evaluation, and the previous queue-wide
  // `some(evaluationHandoffPending) -> return` turned that into a deadlock which left 45 aged
  // artifacts with no canary attempt at all. Once a canary's evidence is durably captured, that
  // artifact no longer owns the canary semaphore; the armed-approval check above still guarantees a
  // single canary in flight.

  for (const artifact of valid) {
    // Artifact-local: this one is done canarying and is waiting on the evaluator. Skip it and keep
    // searching the queue rather than stopping the whole issuer.
    if (evaluationHandoffPending(input.events, artifact)) continue
    const own = forArtifact(input.events, artifact).sort((a, b) => at(a.observedAt) - at(b.observedAt))
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
        && String(event.evidence?.error || '').trim().toLowerCase() !== MASS_CANARY_COLD_START_FAILURE).length
      : 0
    if (failures >= MASS_CANARY_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue

    // Consecutive identical failures are a stuck artifact, not a repairable retry; a different failure resets it.
    const errors = own
      .filter(event => claim(event) === 'local_distilled_runtime_canary_failed')
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
      .map(event => String(event.evidence?.error || '').trim().toLowerCase())
    if (errors.length) {
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
        ...(replayProofNeeded && replayProofArtifact(artifact) ? { remediationReplayProofPriority: true } : {}),
        ...(refreshEndpoint ? { endpointRefresh: true, endpointRefreshReason: 'repeated_evaluation_endpoint_lifecycle_failure' } : {}),
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_canary' }
}
