// saas/lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts
// Owner direction (2026-09-16): mass-distilled evaluations must complete without manual intervention.
// Hand-inserted approvals were the dominant failure class. This pure policy decides, once per cron tick,
// whether to issue ONE bounded evaluation approval in exactly the shape the atomic claim accepts
// (shared endpoint-call ceiling, 4 judge calls, 1 wake, <= $0.20). It never touches the claim, the evaluator,
// the scorer or promotion, and it never re-rolls an artifact that already has a verdict.

import { MASS_EVALUATION_ENDPOINT_CALLS } from './cosUniversityMassEvaluationContextBudget.ts'

export const MASS_EVALUATION_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-16_mass_evaluation_without_manual_intervention' as const
export const MASS_EVALUATION_ROLLING_WINDOW_HOURS = 24
// 2026-09-20 owner direction: remove the evaluator throughput bottleneck after Production measured
// 245 completed mass-training runs in 24h, 46 evaluator completions, 173 evaluation_pending artifacts,
// and 43 already past the 12h retention delay. A 24/day cap cannot keep pace even when the evaluator is
// healthy, so the queue grows by design.
//
// Set the rolling ceiling to 300/day: above the observed 245/day training rate with enough headroom to
// reduce the existing backlog. Claim concurrency is separately bounded so minute ticks may use the approved
// budget without creating an unbounded evaluator fan-out.
//
// Financial boundary: every evaluation still authorizes at most one RunPod wake and at most $0.20 of
// estimated wake cost. Therefore 300/day is a hard theoretical wake-authorization ceiling of $60/day
// if every approval used the full bound. Scoring, exact-artifact binding, retry limits, delayed retention,
// promotion gates, rollback evidence and Production-traffic authority are unchanged.
//
// Unlike the endpoint-call ceiling, this constant has NO database counterpart: the claim function
// asserts maxEndpointCalls, maxJudgeCalls, maxRuntimeWakeAttempts and the per-evaluation cost ceiling,
// but never the rolling cap, which is enforced here alone.
export const MASS_EVALUATION_ROLLING_MAX_APPROVALS = 300
// Production 2026-09-22: RunPod's account-wide serverless worker quota is 10. With three live evaluators,
// one active graduate and other account serverless reservations, the exact-artifact canary lane reached 10/10
// before provider invocation. Reserve one worker of headroom by admitting at most two evaluators concurrently.
// This keeps evaluation throughput above the observed training arrival rate while allowing the canary lane to
// make progress without reclaiming an active graduate, an active evaluator, or unrelated workloads.
export const MASS_EVALUATION_MAX_IN_FLIGHT = 2
export const MASS_EVALUATION_FRONTIER_PROOF_SAMPLE = 4
export const MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE = 2
export const MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE = 2
export const MASS_EVALUATION_BUILDER_V2_OPTIMIZER = 'frontier_response_anchor_then_stable_on_policy_distillation' as const
export const MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3
// An infrastructure failure is retried indefinitely on purpose: the evaluator gets repaired and the artifact
// resumes. That is only true while the failures differ. mass:8f5af666 reproduced the SAME truncated case
// (answer_missing:0ee6ecdba3940d76:finish=length) at 21:06, 21:08, 21:10 and 21:12 UTC on 2026-09-17, waking paid
// compute each time and learning nothing. Identical repeats stop; a different failure resets the count.
export const MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES = 4
// Production 2026-09-21: a single old artifact alternated among readiness, 502, timeout and
// truncated-answer infrastructure failures. Because the error STRING changed, the identical-error ladder
// reset and the same artifact could reclaim one of four evaluator slots seconds later while 240+ eligible
// artifacts waited. Give every infrastructure failure a short fairness floor; the existing identical-error
// ladder still adds the longer backoff for a truly repeating defect. This changes scheduling only: it does
// not consume a substantive attempt, widen spend, change scores, or weaken any graduation gate.
export const MASS_EVALUATION_INFRASTRUCTURE_FAILURE_MIN_COOLDOWN_MS = 10 * 60_000
// The identical-failure stop above had no time bound: once four identical failures were recorded, the artifact
// was skipped on every subsequent tick forever, with nothing in the system able to release it except a
// hand-inserted reopen event. That is correct for a permanent defect and wrong for a transient one, and the
// most common infrastructure failure on this lane - mass_distilled_evaluation_runtime_not_ready - is exactly
// the transient kind: RunPod scheduling or a cold image pull leaves no worker bound inside the ready window,
// the artifact is untouched, and four unlucky ticks permanently sideline an artifact that nothing is wrong with.
//
// So the stop becomes a decaying cooldown rather than a wall. Past the fourth identical failure the artifact
// waits, and each further identical failure waits longer, capped. A transient condition clears itself without a
// human; a genuinely permanent one settles at roughly two attempts a day instead of one every two minutes.
// A different failure still resets the run to zero, as before.
//
// This changes WHEN an artifact may be retried and nothing else: the substantive-attempt budget, the 24h
// rolling approval window/300-per-day ceiling, the per-evaluation wake and judge ceilings, exact-artifact binding, one verdict per
// artifact and every promotion gate are untouched.
const MASS_EVALUATION_IDENTICAL_FAILURE_COOLDOWNS_MS = Object.freeze([
  30 * 60_000,
  60 * 60_000,
  2 * 3_600_000,
  4 * 3_600_000,
  12 * 3_600_000,
])

export function identicalInfrastructureFailureCooldownMs(identical: number): number {
  if (!Number.isFinite(identical) || identical < MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES) return 0
  const step = Math.floor(identical) - MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES
  const ladder = MASS_EVALUATION_IDENTICAL_FAILURE_COOLDOWNS_MS
  return ladder[Math.min(step, ladder.length - 1)]
}
// #2457 repaired the baseline seven-case transport regression introduced while preserving retry headroom.
// Failures from before that Production generation must not permanently suppress the artifact; only failures observed
// after the repaired baseline split is live count toward the identical-infrastructure circuit breaker.
export const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF = 'mass_evaluation_judge_timeout_headroom' as const
export const MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF = 'mass_evaluation_absolute_per_answer_judge_v2' as const
export const MASS_EVALUATION_REOPEN_CLAIM = 'mass_distilled_independent_evaluation_reopened' as const
export const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT = '2026-09-18T01:48:45.894Z' as const
const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)
// Production 2026-09-24: the Residency endpoint lease repair released idle resident maxWorkers
// reservations and stopped the account-wide RunPod quota failures. Failures from the broken quota
// generation remain durable evidence, but must not hold a repaired artifact in the old exponential
// cooldown for another hour or longer after the provider/control-plane defect is gone.
export const MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT = '2026-09-24T16:00:00.000Z' as const
const MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT)
const RUNPOD_QUOTA_FAILURE_FRAGMENT = 'max workers across all endpoints must not exceed your workers quota' as const
export const MASS_EVALUATION_RETENTION_DELAY_MS = 12 * 60 * 60 * 1000
export const MASS_EVALUATION_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000
export const MASS_EVALUATION_24GB_REPAIR_REF = 'pr_2398_24gb_evaluator_preflight' as const
const REPAIRED_SUSPENSION_REASON = 'candidate_502_pending_runpod_worker_logs' as const

export type RollingArtifact = Readonly<{
  candidateId: string
  subjectId: string
  artifactHash: string
  createdAt: string
  frontierRecipe?: boolean
  builderV2?: boolean
  remediationReplay?: boolean
  /** Earliest exact-canary timestamp accepted by the atomic claim (post-Residency for Builder artifacts). */
  minimumCanaryObservedAt?: string
}>
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
    || error.startsWith('mass_distilled_evaluation_runpod_timeout:')
    || error.includes('mass_distilled_evaluation_call_timeout')
    || /^mass_distilled_evaluation_runpod_http_(502|503|504):/.test(error)
    // A missing judge result after the inference provider rejects/overloads the request is evaluator infrastructure,
    // not model quality. Release it from both the artifact retry budget and the 24h rolling approval window.
    || error === 'mass_distilled_evaluation_judge_unavailable'
    || error.startsWith('mass_distilled_evaluation_judge_timeout:')
    || error.startsWith('mass_distilled_evaluation_judge_zero_collapse:')
    // Evaluator protocol/output-budget defects are not evidence of model quality. They must fail closed, but they may retry
    // after the evaluator is repaired without consuming the model's substantive-attempt budget or the rolling approval window.
    || error.startsWith('mass_distilled_evaluation_answer_missing:')
    || error.startsWith('mass_distilled_evaluation_answer_empty:')
    // Prepared holdouts may preserve immutable source text in a legacy shape while carrying the
    // canonical prompt/response as structured columns. Rejecting that transport shape is an
    // evaluator compatibility defect, not evidence about model quality.
    // 2026-09-20: the evaluator now appends a structural fingerprint (cols/len/opens/user/assistant) so the
    // offending row shape can be identified without reading the pinned dataset. Match by prefix, or every
    // fingerprinted failure would fall through to model-quality handling and wrongly consume the artifact's
    // substantive-attempt budget and the 24h rolling approval window.
    || error.startsWith('mass_distilled_evaluation_holdout_format_invalid')
    // The holdout reference is an immutable commit. Before the pinned-read repair, the evaluator
    // compared that commit to the dataset's moving HEAD and failed when unrelated later writes advanced HEAD.
    // No model inference occurred, so historical revision_moved events are evaluator infrastructure and must
    // not consume substantive attempts or the 24h approval window.
    || error === 'mass_distilled_evaluation_holdout_revision_moved'
    // The pre-fix evaluator reconstructed a bare hash-only candidate name. The exact runtime serves a runtime-keyed alias,
    // so this 404 proves evaluator/runtime identity drift, not model quality. Keep the exclusion narrow to that known shape.
    || (/^mass_distilled_evaluation_runpod_http_404:candidate:/.test(error)
      && error.includes('the model `itmounts-mass-distilled-')
      && error.includes('does not exist'))
    // A legacy hosted-teacher row whose prompt cannot be recovered through its durable evidence binding is an
    // evaluator/dataset-lineage defect: the artifact was never asked anything, so the failure says nothing about
    // model quality and must not spend its substantive attempts or the rolling approval window.
    || error === 'mass_distilled_evaluation_legacy_hosted_prompt_binding_missing'
    // No worker became ready inside the window (RunPod scheduling/cold start): nothing reached the artifact, so it
    // says nothing about model quality. bootstrap_failed is deliberately NOT here — a bad adapter can cause it.
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
    // RunPod rejects endpoint policy repair before any worker wake when the account's max-worker
    // reservation quota is full. That is provider/control-plane infrastructure, not model quality,
    // and no paid evaluator inference has begun.
    || error.includes('max workers across all endpoints must not exceed your workers quota')
    // A crash inside the evaluator (2026-09-17 20:01-20:20 UTC: "Cannot read properties of undefined (reading
    // 'length')", a leftover model-list read after the runtime wake was repointed) says nothing about the model. It
    // burned all three of mass:481a6760's substantive attempts. A JavaScript defect never reads as model quality;
    // the shapes below cannot be produced by a model's answers, only by our own code or the wake contract.
    || error.startsWith('cannot read properties of')
    || error.startsWith('mass_distilled_evaluation_runtime_wake_')
    || error.startsWith('mass_distilled_evaluation_runtime_not_ready:')
    || error === 'mass_distilled_evaluation_route_deadline_exceeded'
    || error === 'bounded_runtime_evaluation_authorization_missing_or_expired'
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
  if (terminal.evidence?.claim === 'mass_distilled_independent_evaluation_completed') {
    const reopenedAfter = candidateEvents.some(event => event.verifier === 'host_controller'
      && event.evidence?.claim === MASS_EVALUATION_REOPEN_CLAIM
      && event.evidence?.repairRef === MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF
      && at(event.observedAt) > at(terminal.observedAt))
    return !reopenedAfter
  }
  return !evaluatorInfrastructureFailure(terminal)
}

type ArtifactHistory = Readonly<{
  mine: readonly RollingEvent[]
  inCurrentGeneration: (event: RollingEvent) => boolean
  hasVerdict: boolean
  liveStart: boolean
  substantiveFailures: number
  lastError: string
}>

// Shared by the approval decision and the exhaustion sweep so the two can never disagree about how many real
// attempts an artifact has spent. Divergence here would either strand an artifact that still has budget or
// dispose one that does not.
function artifactHistory(artifact: RollingArtifact, events: readonly RollingEvent[], nowMs: number): ArtifactHistory {
  const hash = artifact.artifactHash.toLowerCase()
  const mine = events.filter(event => event.candidateId === artifact.candidateId
    && String(event.evidence?.artifactHash || '').toLowerCase() === hash)

  const reopenedAt = mine
    .filter(event => event.verifier === 'host_controller'
      && event.evidence?.claim === MASS_EVALUATION_REOPEN_CLAIM
      && event.evidence?.repairRef === MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF)
    .map(event => at(event.observedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] ?? Number.NEGATIVE_INFINITY
  const inCurrentGeneration = (event: RollingEvent) => at(event.observedAt) >= reopenedAt

  const hasVerdict = mine.some(event => inCurrentGeneration(event)
      && event.verifier === 'independent_scorer'
      && event.evidence?.claim === 'independent_evaluation')
    || mine.some(event => inCurrentGeneration(event)
      && event.evidence?.claim === 'mass_distilled_independent_evaluation_completed')

  const liveStart = Boolean(mine
    .filter(event => inCurrentGeneration(event) && evaluationStarted(event) && at(event.expiresAt) > nowMs)
    .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    .find(start => !mine.some(event => evaluationTerminal(event)
      && at(event.observedAt) >= at(start.observedAt)
      && at(event.observedAt) <= nowMs)))

  const firstRolling = mine
    .filter(event => inCurrentGeneration(event) && event.verifier === 'host_controller' && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF)
    .map(event => at(event.observedAt))
    .sort((a, b) => a - b)[0]
  const substantiveFailures = firstRolling === undefined ? 0 : mine.filter(event => inCurrentGeneration(event)
    && event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
    && at(event.observedAt) >= firstRolling
    && !evaluatorInfrastructureFailure(event)).length

  const lastError = mine
    .filter(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed')
    .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    .map(event => String(event.evidence?.error || '').trim())[0] || ''

  return Object.freeze({ mine, inCurrentGeneration, hasVerdict, liveStart, substantiveFailures, lastError })
}

export type ExhaustedMassEvaluationArtifact = Readonly<{
  candidateId: string
  subjectId: string
  artifactHash: string
  reason: typeof MASS_EVALUATION_EXHAUSTED_REASON
  failedAttempts: number
  lastError: string
}>

export const MASS_EVALUATION_EXHAUSTED_REASON = 'substantive_evaluation_attempts_exhausted' as const

// An artifact that has spent its substantive attempt budget can never be approved again - only a
// hand-inserted reopen event releases it - yet nothing ever moved it out of `evaluation_pending`. It stayed
// in the lane's selection window forever, reported as waiting while no tick could ever pick it, and because
// a bounded front-of-queue window can contain enough permanently ineligible rows to starve newer
// artifacts behind them. Naming them here lets the caller give them a terminal status and a recorded reason,
// which is also what makes a real failure visible to curriculum work instead of silently disappearing.
//
// This decides nothing about quality and grants nothing: it reports artifacts the approval policy has
// already refused permanently, using the same counter that refused them.
export function decideExhaustedMassEvaluationArtifacts(input: {
  artifacts: readonly RollingArtifact[]
  events: readonly RollingEvent[]
  now: Date
}): readonly ExhaustedMassEvaluationArtifact[] {
  const nowMs = input.now.getTime()
  const exhausted: ExhaustedMassEvaluationArtifact[] = []
  for (const artifact of input.artifacts) {
    if (!artifact.candidateId.startsWith('mass:') || !HEX64.test(artifact.artifactHash)) continue
    const history = artifactHistory(artifact, input.events, nowMs)
    // A verdict has its own lifecycle write, and a live run must be left alone.
    if (history.hasVerdict || history.liveStart) continue
    if (history.substantiveFailures < MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue
    exhausted.push(Object.freeze({
      candidateId: artifact.candidateId,
      subjectId: artifact.subjectId,
      artifactHash: artifact.artifactHash.toLowerCase(),
      reason: MASS_EVALUATION_EXHAUSTED_REASON,
      failedAttempts: history.substantiveFailures,
      lastError: history.lastError.slice(0, 500),
    }))
  }
  return Object.freeze(exhausted)
}

export function decideRollingMassEvaluationApproval(input: {
  enabled: boolean
  artifacts: readonly RollingArtifact[]
  events: readonly RollingEvent[]
  now: Date
  frontierProofCompletions?: number
  builderV2ProofCompletions?: number
  remediationReplayProofCompletions?: number
  inFlightCount?: number
}): RollingDecision {
  if (!input.enabled) return { issue: false, reason: 'rolling_mass_evaluation_authorization_disabled' }
  const inFlightCount = Math.max(0, Math.floor(Number(input.inFlightCount ?? 0)))
  if (inFlightCount >= MASS_EVALUATION_MAX_IN_FLIGHT) return { issue: false, reason: 'mass_evaluation_concurrency_full' }
  const nowMs = input.now.getTime()

  const rollingApprovalsInWindow = input.events.filter(event => event.verifier === 'host_controller'
    && event.evidence?.claim === 'distilled_independent_evaluation_approved'
    && event.evidence?.authorizationRef === MASS_EVALUATION_ROLLING_AUTHORIZATION_REF
    && nowMs - at(event.observedAt) < MASS_EVALUATION_ROLLING_WINDOW_HOURS * 3_600_000)
  const issuedInWindow = rollingApprovalsInWindow.filter(approval => rollingApprovalConsumesWindow(approval, input.events, nowMs)).length
  if (issuedInWindow >= MASS_EVALUATION_ROLLING_MAX_APPROVALS) return { issue: false, reason: 'rolling_mass_evaluation_window_exhausted' }

  const proofCompletions = Math.max(0, Math.floor(Number(input.frontierProofCompletions ?? MASS_EVALUATION_FRONTIER_PROOF_SAMPLE)))
  const frontierProofNeeded = proofCompletions < MASS_EVALUATION_FRONTIER_PROOF_SAMPLE
  const builderV2Completions = Math.max(0, Math.floor(Number(input.builderV2ProofCompletions ?? MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE)))
  const builderV2ProofNeeded = builderV2Completions < MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE
  const replayCompletions = Math.max(0, Math.floor(Number(input.remediationReplayProofCompletions ?? MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE)))
  const remediationReplayProofNeeded = replayCompletions < MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE
  const ordered = [...input.artifacts].sort((a, b) => {
    // Builder apprenticeship proof lane: until two confirmed response-anchor v2 Computer Science artifacts
    // have durable independent evaluation results, keep those exact artifacts ahead of the legacy backlog.
    // This changes scheduling only; the full 12-hour retention delay, exact canary, scoring, retry, spend,
    // promotion and Production-traffic gates remain unchanged.
    if (builderV2ProofNeeded) {
      const aBuilder = a.builderV2 === true
      const bBuilder = b.builderV2 === true
      if (aBuilder !== bBuilder) return aBuilder ? -1 : 1
    }
    // Once the established Builder sample is complete, prioritize only the first two artifacts whose
    // durable receipt proves post-GKD failure-derived replay. This is scheduling only; the 12-hour
    // retention delay below and every scoring/spend/promotion gate remain unchanged.
    if (remediationReplayProofNeeded) {
      const aReplay = a.remediationReplay === true
      const bReplay = b.remediationReplay === true
      if (aReplay !== bReplay) return aReplay ? -1 : 1
    }
    // Preserve the older bounded frontier proof lane for repositories where it is still incomplete.
    if (frontierProofNeeded) {
      const aProof = a.frontierRecipe === true
      const bProof = b.frontierRecipe === true
      if (aProof !== bProof) return aProof ? -1 : 1
    }
    return at(a.createdAt) - at(b.createdAt)
  })
  for (const artifact of ordered) {
    if (!artifact.candidateId.startsWith('mass:') || !HEX64.test(artifact.artifactHash)) continue
    if (nowMs - at(artifact.createdAt) < MASS_EVALUATION_RETENTION_DELAY_MS) continue
    const hash = artifact.artifactHash.toLowerCase()
    const history = artifactHistory(artifact, input.events, nowMs)
    const mine = history.mine
    const reopenedAt = mine
      .filter(event => event.verifier === 'host_controller'
        && event.evidence?.claim === MASS_EVALUATION_REOPEN_CLAIM
        && event.evidence?.repairRef === MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF)
      .map(event => at(event.observedAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] ?? Number.NEGATIVE_INFINITY
    const inCurrentGeneration = history.inCurrentGeneration

    if (history.hasVerdict) continue

    const minimumCanaryAt = at(artifact.minimumCanaryObservedAt)
    const canary = mine.some(event => event.verifier === 'host_production_verifier'
      && event.evidence?.claim === 'production_canary_healthy'
      && event.evidence?.exactArtifact === true
      && event.evidence?.productionTrafficAuthorized === false
      && (!Number.isFinite(minimumCanaryAt) || at(event.observedAt) >= minimumCanaryAt))
    if (!canary) continue

    // The atomic claim serializes execution, but authorization runs more often than long evaluations complete.
    // Do not mint another approval while this exact artifact already has a live started reservation.
    if (history.liveStart) continue

    const failures = history.substantiveFailures
    if (failures >= MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue

    // Before the repair exists, preserve the historical circuit breaker. At/after the named repair epoch, only failures
    // from the repaired generation count so the fixed evaluator gets one honest retry without erasing prior evidence.
    const infrastructureGenerationStart = Math.max(reopenedAt, nowMs >= MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS
      ? MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS
      : Number.NEGATIVE_INFINITY)
    const recentFailures = mine
      .filter(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
        && at(event.observedAt) >= infrastructureGenerationStart)
      .filter(event => {
        const observedAt = at(event.observedAt)
        const error = String(event.evidence?.error || '').trim().toLowerCase()
        return !(Number.isFinite(observedAt)
          && observedAt < MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT_MS
          && error.includes(RUNPOD_QUOTA_FAILURE_FRAGMENT))
      })
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    // Fairness floor: any newest infrastructure/control-plane failure yields this artifact briefly so
    // the scheduler can try another eligible artifact. Different infrastructure error strings do not erase
    // the floor. Substantive model-quality failures do not enter this branch and retain their separate budget.
    const newestFailure = recentFailures[0]
    if (newestFailure && evaluatorInfrastructureFailure(newestFailure)) {
      const newestFailureAt = at(newestFailure.observedAt)
      if (!Number.isFinite(newestFailureAt)) continue
      if (nowMs - newestFailureAt < MASS_EVALUATION_INFRASTRUCTURE_FAILURE_MIN_COOLDOWN_MS) continue
    }

    const recentErrors = recentFailures.map(event => String(event.evidence?.error || '').trim().toLowerCase())
    const newest = recentErrors[0]
    if (newest) {
      let identical = 0
      for (const error of recentErrors) {
        if (error !== newest) break
        identical += 1
      }
      if (identical >= MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES) {
        // Wait out the cooldown instead of skipping forever. An unreadable timestamp is treated as still
        // cooling: releasing an artifact on evidence we cannot read is the unsafe reading.
        const newestFailureAt = at(recentFailures[0].observedAt)
        if (!Number.isFinite(newestFailureAt)) continue
        if (nowMs - newestFailureAt < identicalInfrastructureFailureCooldownMs(identical)) continue
      }
    }

    const controls = mine
      .filter(event => inCurrentGeneration(event) && event.verifier === 'host_controller'
        && (event.evidence?.claim === 'distilled_independent_evaluation_approved' || event.evidence?.claim === 'distilled_independent_evaluation_suspended'))
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    const latest = controls[0]
    const repairedSuspension = latest?.evidence?.claim === 'distilled_independent_evaluation_suspended'
      && String(latest.evidence?.reason || '') === REPAIRED_SUSPENSION_REASON
    if (latest?.evidence?.claim === 'distilled_independent_evaluation_suspended' && !repairedSuspension) continue
    if (latest && latest.evidence?.claim === 'distilled_independent_evaluation_approved') {
      const startedAfter = mine.some(event => inCurrentGeneration(event) && event.evidence?.claim === 'mass_distilled_independent_evaluation_started' && at(event.observedAt) >= at(latest.observedAt))
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
        ...(remediationReplayProofNeeded && artifact.remediationReplay === true ? { remediationReplayProofPriority: true } : {}),
        ...(repairedSuspension ? { resumeAfterSuspension: true, repairRef: MASS_EVALUATION_24GB_REPAIR_REF } : {}),
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' }
}
