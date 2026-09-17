// saas/lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts
// Owner direction (2026-09-16): mass-distilled evaluations must complete without manual intervention.
// Hand-inserted approvals were the dominant failure class. This pure policy decides, once per cron tick,
// whether to issue ONE bounded evaluation approval in exactly the shape the atomic claim accepts
// (8 endpoint calls, 4 judge calls, 1 wake, <= $0.20). It never touches the claim, the evaluator,
// the scorer or promotion, and it never re-rolls an artifact that already has a verdict.

export const MASS_EVALUATION_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-16_mass_evaluation_without_manual_intervention' as const
export const MASS_EVALUATION_ROLLING_WINDOW_HOURS = 24
export const MASS_EVALUATION_ROLLING_MAX_APPROVALS = 12
export const MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3
export const MASS_EVALUATION_RETENTION_DELAY_MS = 12 * 60 * 60 * 1000
export const MASS_EVALUATION_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000

export type RollingArtifact = Readonly<{ candidateId: string; subjectId: string; artifactHash: string; createdAt: string }>
export type RollingEvent = Readonly<{ candidateId: string; observedAt: string; expiresAt: string | null; verifier: string; evidence: Record<string, unknown> | null }>

export type RollingDecision =
  | Readonly<{ issue: true; artifact: RollingArtifact; evidence: Record<string, unknown> }>
  | Readonly<{ issue: false; reason: string }>

const HEX64 = /^[a-f0-9]{64}$/i
const at = (value: string | null | undefined) => Date.parse(String(value || ''))

function evaluatorInfrastructureFailure(event: RollingEvent): boolean {
  const error = String(event.evidence?.error || '').trim().toLowerCase()
  if (!error) return false
  return error.startsWith('mass_distilled_evaluation_context_budget_insufficient:')
    || error.includes("maximum context length is 8192 tokens")
    || error === 'the operation was aborted due to timeout'
    || error.includes('mass_distilled_evaluation_call_timeout')
    || /^mass_distilled_evaluation_runpod_http_(502|503|504):/.test(error)
    // No worker became ready inside the window (RunPod scheduling/cold start): nothing reached the artifact, so it
    // says nothing about model quality. bootstrap_failed is deliberately NOT here — a bad adapter can cause it.
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
}

export function decideRollingMassEvaluationApproval(input: {
  enabled: boolean
  artifacts: readonly RollingArtifact[]
  events: readonly RollingEvent[]
  now: Date
}): RollingDecision {
  if (!input.enabled) return { issue: false, reason: 'rolling_mass_evaluation_authorization_disabled' }
  const nowMs = input.now.getTime()

  const issuedInWindow = input.events.filter(event => event.verifier === 'host_controller'
    && event.evidence?.claim === 'distilled_independent_evaluation_approved'
    && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF
    && nowMs - at(event.observedAt) < MASS_EVALUATION_ROLLING_WINDOW_HOURS * 3_600_000).length
  if (issuedInWindow >= MASS_EVALUATION_ROLLING_MAX_APPROVALS) return { issue: false, reason: 'rolling_mass_evaluation_window_exhausted' }

  const ordered = [...input.artifacts].sort((a, b) => at(a.createdAt) - at(b.createdAt))
  for (const artifact of ordered) {
    if (!artifact.candidateId.startsWith('mass:') || !HEX64.test(artifact.artifactHash)) continue
    if (nowMs - at(artifact.createdAt) < MASS_EVALUATION_RETENTION_DELAY_MS) continue
    const hash = artifact.artifactHash.toLowerCase()
    const mine = input.events.filter(event => event.candidateId === artifact.candidateId
      && String(event.evidence?.artifactHash || '').toLowerCase() === hash)

    // A verdict exists: never re-run the same artifact to fish for a different score.
    if (mine.some(event => event.verifier === 'independent_scorer' && event.evidence?.claim === 'independent_evaluation')) continue
    if (mine.some(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_completed')) continue

    // The exact runtime must already be proven by its canary.
    const canary = mine.some(event => event.verifier === 'host_production_verifier'
      && event.evidence?.claim === 'production_canary_healthy'
      && event.evidence?.exactArtifact === true
      && event.evidence?.productionTrafficAuthorized === false)
    if (!canary) continue

    // Repeated substantive failures of attempts THIS authority started stop automatic retries; the owner decides after that.
    // Failures caused by evaluator/runtime infrastructure defects do not count against the artifact: they do not constitute
    // evidence about model quality and should be retried after the evaluator is repaired. Earlier hand-approved attempts also
    // remain outside this budget.
    const firstRolling = mine
      .filter(event => event.verifier === 'host_controller' && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF)
      .map(event => at(event.observedAt))
      .sort((a, b) => a - b)[0]
    const failures = firstRolling === undefined ? 0 : mine.filter(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
      && at(event.observedAt) >= firstRolling
      && !evaluatorInfrastructureFailure(event)).length
    if (failures >= MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue

    // Respect the latest owner control: a suspension, or an approval that is still armed, means no new one.
    const controls = mine
      .filter(event => event.verifier === 'host_controller'
        && (event.evidence?.claim === 'distilled_independent_evaluation_approved' || event.evidence?.claim === 'distilled_independent_evaluation_suspended'))
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    const latest = controls[0]
    if (latest?.evidence?.claim === 'distilled_independent_evaluation_suspended') continue
    if (latest) {
      const startedAfter = mine.some(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_started' && at(event.observedAt) >= at(latest.observedAt))
      if (!startedAfter && at(latest.expiresAt) > nowMs) continue
    }

    return {
      issue: true,
      artifact,
      evidence: {
        profile: 'cos_distilled_independent_evaluation_authorization_v1',
        claim: 'distilled_independent_evaluation_approved',
        candidateId: artifact.candidateId,
        artifactHash: hash,
        evaluationAuthorized: true,
        maxEndpointCalls: 8,
        maxJudgeCalls: 4,
        maxRuntimeWakeAttempts: 1,
        maxEstimatedRuntimeWakeCostUsd: 0.2,
        productionTrafficAuthorized: false,
        authorityExpanded: false,
        authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
        rollingWindowHours: MASS_EVALUATION_ROLLING_WINDOW_HOURS,
        rollingMaxApprovals: MASS_EVALUATION_ROLLING_MAX_APPROVALS,
        priorFailedAttempts: failures,
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' }
}
