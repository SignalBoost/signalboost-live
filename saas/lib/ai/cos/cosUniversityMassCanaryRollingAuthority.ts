// saas/lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts
// Owner direction (2026-09-17): mass-distilled artifacts must reach independent evaluation without a hand-inserted
// canary approval each. On 2026-09-17 all 30 evaluation_pending mass artifacts had no canary, so the automatic
// evaluator (which requires a passed canary) had nothing it could run. This pure policy decides, once per cron tick,
// whether to issue ONE canary approval in exactly the shape claim_next_mass_distilled_runtime_canary accepts
// (1 invocation, <= $0.20). It never touches the claim, the canary, the evaluator, promotion or Production traffic.

export const MASS_CANARY_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-17_mass_canary_without_manual_intervention' as const
export const MASS_CANARY_PROFILE = 'cos_local_distilled_runtime_deploy_v1' as const
export const MASS_CANARY_APPROVAL_CLAIM = 'local_distilled_runtime_deploy_approved' as const
export const MASS_CANARY_ROLLING_WINDOW_HOURS = 24
// 2026-09-17: 36 of 37 artifacts still need a canary, each taking 2-3 attempts because a cold RunPod worker often
// misses the readiness window. At 24 approvals a day that is a multi-day drain of work that is already trained and
// paid for. The ceiling is what bounds spend (<= $0.20 per canary), so it moves from 24 to 72: about $14.40/day
// worst case, and one canary still runs at a time.
export const MASS_CANARY_ROLLING_MAX_APPROVALS = 72
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
const MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3

export type CanaryArtifact = Readonly<{ candidateId: string; subjectId: string; artifactHash: string; createdAt: string }>
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
    const after = own.filter(event => at(event.observedAt) >= approvedAt)
    if (after.some(event => claim(event) === 'local_distilled_runtime_canary_invocation_started')) return false
    return after.filter(event => claim(event) === 'local_distilled_runtime_canary_preflight_failed').length < 3
  })
}

export function decideMassCanaryRollingApproval(input: {
  artifacts: readonly CanaryArtifact[]
  events: readonly CanaryEvent[]
  now: Date
  enabled: boolean
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
    .sort((a, b) => at(a.createdAt) - at(b.createdAt) || a.candidateId.localeCompare(b.candidateId))

  // Keep the exact endpoint alive until independent evaluation is done with it. Provisioning a new
  // canary retires older mass endpoints, so allowing overlap would turn a healthy endpoint into a
  // runtime_not_ready/network failure for the evaluator. Repeated lifecycle failure is the exception:
  // that stale binding must be replaced rather than reserved forever.
  if (valid.some(artifact => evaluationHandoffPending(input.events, artifact))) {
    return { issue: false, reason: 'mass_canary_waiting_for_independent_evaluation' }
  }

  // The claim serves one reservation at a time; issuing a second approval while one is armed only queues spend.
  if (valid.some(artifact => armedApproval(forArtifact(input.events, artifact), nowMs))) {
    return { issue: false, reason: 'mass_canary_approval_already_armed' }
  }

  for (const artifact of valid) {
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
        ...(refreshEndpoint ? { endpointRefresh: true, endpointRefreshReason: 'repeated_evaluation_endpoint_lifecycle_failure' } : {}),
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_canary' }
}
