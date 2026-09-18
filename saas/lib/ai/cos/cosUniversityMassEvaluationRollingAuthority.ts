// saas/lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts
// Owner direction (2026-09-16): mass-distilled evaluations must complete without manual intervention.
// Hand-inserted approvals were the dominant failure class. This pure policy decides, once per cron tick,
// whether to issue ONE bounded evaluation approval in exactly the shape the atomic claim accepts
// (shared endpoint-call ceiling, 4 judge calls, 1 wake, <= $0.20). It never touches the claim, the evaluator,
// the scorer or promotion, and it never re-rolls an artifact that already has a verdict.

import { MASS_EVALUATION_ENDPOINT_CALLS } from './cosUniversityMassEvaluationContextBudget.ts'

export const MASS_EVALUATION_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-16_mass_evaluation_without_manual_intervention' as const
export const MASS_EVALUATION_ROLLING_WINDOW_HOURS = 24
export const MASS_EVALUATION_ROLLING_MAX_APPROVALS = 12
export const MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3
// An infrastructure failure is retried indefinitely on purpose: the evaluator gets repaired and the artifact
// resumes. That is only true while the failures differ. mass:8f5af666 reproduced the SAME truncated case
// (answer_missing:0ee6ecdba3940d76:finish=length) at 21:06, 21:08, 21:10 and 21:12 UTC on 2026-09-17, waking paid
// compute each time and learning nothing. Identical repeats stop; a different failure resets the count.
export const MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES = 4
// #2457 repaired the baseline seven-case transport regression introduced while preserving retry headroom.
// Failures from before that Production generation must not permanently suppress the artifact; only failures observed
// after the repaired baseline split is live count toward the identical-infrastructure circuit breaker.
export const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF = 'mass_evaluation_judge_timeout_headroom' as const
export const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT = '2026-09-18T01:48:45.894Z' as const
const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)
export const MASS_EVALUATION_RETENTION_DELAY_MS = 12 * 60 * 60 * 1000
export const MASS_EVALUATION_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000
export const MASS_EVALUATION_24GB_REPAIR_REF = 'pr_2398_24gb_evaluator_preflight' as const
const REPAIRED_SUSPENSION_REASON = 'candidate_502_pending_runpod_worker_logs' as const

export type RollingArtifact = Readonly<{ candidateId: string; subjectId: string; artifactHash: string; createdAt: string }>
export type RollingEvent = Readonly<{ candidateId: string; observedAt: string; expiresAt: string | null; verifier: string; evidence: Record<string, unknown> | null }>

export type RollingDecision =
  | Readonly<{ issue: true; artifact: RollingArtifact; evidence: Record<string, unknown> }>
  | Readonly<{ issue: false; reason: string }>

const HEX64 = /^[a-f0-9]{64}$/i
const at = (value: string | null | undefined) => Date.parse(String(value || ''))
const evaluationStarted = (event: RollingEvent) => event.evidence?.claim === 'mass_distilled_independent_evaluation_started'
const evaluationTerminal = (event: RollingEvent) => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
  || event.evidence?.claim === 'mass_distilled_independent_evaluation_completed'

function evaluatorInfrastructureFailure(event: RollingEvent): boolean {
  const error = String(event.evidence?.error || '').trim().toLowerCase()
  if (!error) return false
  return error.startsWith('mass_distilled_evaluation_context_budget_insufficient:')
    || error.startsWith('mass_distilled_evaluation_endpoint_call_ceiling:')
    || error.startsWith('mass_distilled_evaluation_endpoint_call_ceiling_plan:')
    || error.includes("maximum context length is 8192 tokens")
    || error === 'the operation was aborted due to timeout'
    || error.includes('mass_distilled_evaluation_call_timeout')
    || /^mass_distilled_evaluation_runpod_http_(502|503|504):/.test(error)
    // A missing judge result after the inference provider rejects/overloads the request is evaluator infrastructure,
    // not model quality. Release it from both the artifact retry budget and the 24h rolling approval window.
    || error === 'mass_distilled_evaluation_judge_unavailable'
    || error.startsWith('mass_distilled_evaluation_judge_timeout:')
    // Evaluator protocol/output-budget defects are not evidence of model quality. They must fail closed, but they may retry
    // after the evaluator is repaired without consuming the model's substantive-attempt budget or the rolling approval window.
    || error.startsWith('mass_distilled_evaluation_answer_missing:')
    || error.startsWith('mass_distilled_evaluation_answer_empty:')
    // The pre-fix evaluator reconstructed a bare hash-only candidate name. The exact runtime serves a runtime-keyed alias,
    // so this 404 proves evaluator/runtime identity drift, not model quality. Keep the exclusion narrow to that known shape.
    || (/^mass_distilled_evaluation_runpod_http_404:candidate:/.test(error)
      && error.includes('the model `itmounts-mass-distilled-')
      && error.includes('does not exist'))
    // No worker became ready inside the window (RunPod scheduling/cold start): nothing reached the artifact, so it
    // says nothing about model quality. bootstrap_failed is deliberately NOT here — a bad adapter can cause it.
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
    // A crash inside the evaluator (2026-09-17 20:01-20:20 UTC: "Cannot read properties of undefined (reading
    // 'length')", a leftover model-list read after the runtime wake was repointed) says nothing about the model. It
    // burned all three of mass:481a6760's substantive attempts. A JavaScript defect never reads as model quality;
    // the shapes below cannot be produced by a model's answers, only by our own code or the wake contract.
    || error.startsWith('cannot read properties of')
    || error.startsWith('mass_distilled_evaluation_runtime_wake_')
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
    || error === 'mass_distilled_evaluation_route_deadline_exceeded'
    || /\bis not a function\b/.test(error)
}

function rollingApprovalConsumesWindow(approval: RollingEvent, events: readonly RollingEvent[], nowMs: number): boolean {
  const approvalAt = at(approval.observedAt)
  if (!Number.isFinite(approvalAt)) return true
  const candidateEvents = events.filter(event => event.candidateId === approval.candidateId)
  const nextApprovalAt = candidateEvents
    .filter(event => event.verifier === 'host_controller'
      && event.evidence?.claim === 'distilled_independent_evaluation_approved'
      && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF
      && at(event.observedAt) > approvalAt)
    .map(event => at(event.observedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY

  // Count the approval against the 24h window only if it actually arms a run. Bind approval -> start -> terminal,
  // not approval -> next approval, so a shadow approval issued during a live run cannot steal the terminal event.
  const start = candidateEvents
    .filter(event => evaluationStarted(event) && at(event.observedAt) >= approvalAt && at(event.observedAt) < nextApprovalAt)
    .sort((a, b) => at(a.observedAt) - at(b.observedAt))[0]
  if (!start) {
    const priorOpenStart = candidateEvents
      .filter(event => evaluationStarted(event) && at(event.observedAt) < approvalAt && at(event.expiresAt) > approvalAt)
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
      .find(prior => !candidateEvents.some(event => evaluationTerminal(event)
        && at(event.observedAt) >= at(prior.observedAt)
        && at(event.observedAt) < approvalAt))
    if (priorOpenStart) return false
    if (Number.isFinite(nextApprovalAt)) return false
    const approvalExpiry = at(approval.expiresAt)
    return !Number.isFinite(approvalExpiry) || approvalExpiry > nowMs
  }

  const startAt = at(start.observedAt)
  const nextStartAt = candidateEvents
    .filter(event => evaluationStarted(event) && at(event.observedAt) > startAt)
    .map(event => at(event.observedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY
  const terminal = candidateEvents
    .filter(event => evaluationTerminal(event)
      && at(event.observedAt) >= startAt
      && at(event.observedAt) < nextStartAt)
    .sort((a, b) => at(a.observedAt) - at(b.observedAt))[0]
  if (!terminal) return at(start.expiresAt) > nowMs
  if (terminal.evidence?.claim === 'mass_distilled_independent_evaluation_completed') return true
  return !evaluatorInfrastructureFailure(terminal)
}

export function decideRollingMassEvaluationApproval(input: {
  enabled: boolean
  artifacts: readonly RollingArtifact[]
  events: readonly RollingEvent[]
  now: Date
}): RollingDecision {
  if (!input.enabled) return { issue: false, reason: 'rolling_mass_evaluation_authorization_disabled' }
  const nowMs = input.now.getTime()

  const rollingApprovalsInWindow = input.events.filter(event => event.verifier === 'host_controller'
    && event.evidence?.claim === 'distilled_independent_evaluation_approved'
    && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF
    && nowMs - at(event.observedAt) < MASS_EVALUATION_ROLLING_WINDOW_HOURS * 3_600_000)
  const issuedInWindow = rollingApprovalsInWindow.filter(approval => rollingApprovalConsumesWindow(approval, input.events, nowMs)).length
  if (issuedInWindow >= MASS_EVALUATION_ROLLING_MAX_APPROVALS) return { issue: false, reason: 'rolling_mass_evaluation_window_exhausted' }

  const ordered = [...input.artifacts].sort((a, b) => at(a.createdAt) - at(b.createdAt))
  for (const artifact of ordered) {
    if (!artifact.candidateId.startsWith('mass:') || !HEX64.test(artifact.artifactHash)) continue
    if (nowMs - at(artifact.createdAt) < MASS_EVALUATION_RETENTION_DELAY_MS) continue
    const hash = artifact.artifactHash.toLowerCase()
    const mine = input.events.filter(event => event.candidateId === artifact.candidateId
      && String(event.evidence?.artifactHash || '').toLowerCase() === hash)

    if (mine.some(event => event.verifier === 'independent_scorer' && event.evidence?.claim === 'independent_evaluation')) continue
    if (mine.some(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_completed')) continue

    const canary = mine.some(event => event.verifier === 'host_production_verifier'
      && event.evidence?.claim === 'production_canary_healthy'
      && event.evidence?.exactArtifact === true
      && event.evidence?.productionTrafficAuthorized === false)
    if (!canary) continue

    // The atomic claim serializes execution, but authorization runs more often than long evaluations complete.
    // Do not mint another approval while this exact artifact already has a live started reservation.
    const liveStart = mine
      .filter(event => evaluationStarted(event) && at(event.expiresAt) > nowMs)
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
      .find(start => !mine.some(event => evaluationTerminal(event)
        && at(event.observedAt) >= at(start.observedAt)
        && at(event.observedAt) <= nowMs))
    if (liveStart) continue

    const firstRolling = mine
      .filter(event => event.verifier === 'host_controller' && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF)
      .map(event => at(event.observedAt))
      .sort((a, b) => a - b)[0]
    const failures = firstRolling === undefined ? 0 : mine.filter(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
      && at(event.observedAt) >= firstRolling
      && !evaluatorInfrastructureFailure(event)).length
    if (failures >= MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue

    // Before the repair exists, preserve the historical circuit breaker. At/after the named repair epoch, only failures
    // from the repaired generation count so the fixed evaluator gets one honest retry without erasing prior evidence.
    const infrastructureGenerationStart = nowMs >= MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS
      ? MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS
      : Number.NEGATIVE_INFINITY
    const recentErrors = mine
      .filter(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
        && at(event.observedAt) >= infrastructureGenerationStart)
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
      .map(event => String(event.evidence?.error || '').trim().toLowerCase())
    const newest = recentErrors[0]
    if (newest) {
      let identical = 0
      for (const error of recentErrors) {
        if (error !== newest) break
        identical += 1
      }
      if (identical >= MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES) continue
    }

    const controls = mine
      .filter(event => event.verifier === 'host_controller'
        && (event.evidence?.claim === 'distilled_independent_evaluation_approved' || event.evidence?.claim === 'distilled_independent_evaluation_suspended'))
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    const latest = controls[0]
    const repairedSuspension = latest?.evidence?.claim === 'distilled_independent_evaluation_suspended'
      && String(latest.evidence?.reason || '') === REPAIRED_SUSPENSION_REASON
    if (latest?.evidence?.claim === 'distilled_independent_evaluation_suspended' && !repairedSuspension) continue
    if (latest && latest.evidence?.claim === 'distilled_independent_evaluation_approved') {
      const startedAfter = mine.some(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_started' && at(event.observedAt) >= at(latest.observedAt))
      // An armed approval only reserves the slot while it is still CLAIMABLE. The claim validator accepts an approval
      // only at the current endpoint-call ceiling, so one issued under a previous ceiling can never start an attempt —
      // yet it used to hold the slot for its full 2h TTL, stalling the artifact for no reason. Production 2026-09-18
      // 00:36 UTC: 52 approvals armed at the old ceiling of 8, newest expiring at 01:32, with every cron tick reporting
      // no_atomically_claimable while nothing could ever claim them. Treat a stale-ceiling approval as spent so the
      // authority issues a current one on the next tick. This grants no new authority: the replacement is issued in the
      // same shape, inside the same rolling window, and every spend and promotion gate is unchanged.
      // Only a ceiling that is PRESENT and mismatched proves the approval is dead. An approval that records no ceiling
      // at all is treated as blocking, because releasing a reserved slot on missing evidence is the unsafe reading.
      const recordedCalls = Number(latest.evidence?.maxEndpointCalls)
      const staleCeiling = Number.isFinite(recordedCalls) && recordedCalls !== MASS_EVALUATION_ENDPOINT_CALLS
      if (!staleCeiling && !startedAfter && at(latest.expiresAt) > nowMs) continue
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
        maxEndpointCalls: MASS_EVALUATION_ENDPOINT_CALLS,
        maxJudgeCalls: 4,
        maxRuntimeWakeAttempts: 1,
        maxEstimatedRuntimeWakeCostUsd: 0.2,
        productionTrafficAuthorized: false,
        authorityExpanded: false,
        authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
        rollingWindowHours: MASS_EVALUATION_ROLLING_WINDOW_HOURS,
        rollingMaxApprovals: MASS_EVALUATION_ROLLING_MAX_APPROVALS,
        infrastructureRepairRef: MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF,
        infrastructureRepairAt: MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT,
        priorFailedAttempts: failures,
        ...(repairedSuspension ? { resumeAfterSuspension: true, repairRef: MASS_EVALUATION_24GB_REPAIR_REF } : {}),
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' }
}
