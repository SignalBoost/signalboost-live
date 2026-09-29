// saas/lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts
// Owner direction (2026-09-16): mass-distilled evaluations must complete without manual intervention.
// Hand-inserted approvals were the dominant failure class. This pure policy decides, once per cron tick,
// whether to issue ONE bounded evaluation approval in exactly the shape the atomic claim accepts
// (shared endpoint-call ceiling, 4 judge calls, 1 wake, <= $0.20). It never touches the claim, the evaluator,
// the scorer or promotion, and it never re-rolls an artifact that already has a verdict.

import { MASS_EVALUATION_ENDPOINT_CALLS } from './cosUniversityMassEvaluationContextBudget.ts'
import { MASS_RETENTION_DELAY_MS } from './cosUniversityMassRetentionDelay.ts'

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
export const MASS_EVALUATION_REMEDIATION_REPLAY_MIN_ITEMS = 20
export const MASS_EVALUATION_REMEDIATION_REPLAY_MIN_EPOCHS = 3
export const MASS_EVALUATION_REMEDIATION_REPLAY_MIN_LEARNING_RATE = 5e-5
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
export const MASS_EVALUATION_OWNER_FULL_RETEST_REF = 'owner_explicit_direction_2026-09-26_retest_all_quarantined' as const
const isEvaluationReopen = (event: RollingEvent) => event.verifier === 'host_controller'
  && event.evidence?.claim === MASS_EVALUATION_REOPEN_CLAIM
  && (event.evidence?.repairRef === MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF
    || event.evidence?.repairRef === MASS_EVALUATION_OWNER_FULL_RETEST_REF)
export const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT = '2026-09-18T01:48:45.894Z' as const
const MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT)
// Production 2026-09-24: the Residency endpoint lease repair released idle resident maxWorkers
// reservations and stopped the account-wide RunPod quota failures. Failures from the broken quota
// generation remain durable evidence, but must not hold a repaired artifact in the old exponential
// cooldown for another hour or longer after the provider/control-plane defect is gone.
export const MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT = '2026-09-24T16:00:00.000Z' as const
const MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT)
const RUNPOD_QUOTA_FAILURE_FRAGMENT = 'max workers across all endpoints must not exceed your workers quota' as const
// Production 2026-09-24: #3165 replaced the false RunPod workers.ready-only evaluator gate with
// exact worker-local /ping model readiness. Historical runtime_not_ready failures from the broken
// predicate remain durable evidence, but must not keep repaired artifacts in the old identical-error
// cooldown generation. Only pre-repair readiness failures are released; every other infrastructure
// error and every post-repair readiness failure retains the normal fairness/cooldown policy.
export const MASS_EVALUATION_MODEL_READY_REPAIR_AT = '2026-09-24T19:26:08.571Z' as const
const MASS_EVALUATION_MODEL_READY_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_MODEL_READY_REPAIR_AT)
// Production 2026-09-26: the v4 exact-artifact canary proved an endpoint healthy, but the evaluator
// rejected the same authenticated /ping response as runtime_not_ready:200 because it required a JSON
// body shape the RunPod load balancer does not always preserve. Only the one observed pre-repair 200
// readiness failure is released from cooldown; all non-200 readiness failures keep normal policy.
export const MASS_EVALUATION_PING_200_REPAIR_AT = '2026-09-26T15:02:09.154Z' as const
const MASS_EVALUATION_PING_200_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_PING_200_REPAIR_AT)
const RUNTIME_NOT_READY_FAILURE_PREFIX = 'mass_distilled_evaluation_runtime_not_ready:' as const
// Test phase (owner 2026-09-28): 10 minutes, shared with the evaluator and canary ordering. See cosUniversityMassRetentionDelay.ts.
export const MASS_EVALUATION_RETENTION_DELAY_MS = MASS_RETENTION_DELAY_MS
export const MASS_EVALUATION_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000
// Standard gateway generation that accepts both the pinned base model and exact adapter alias.
// A pre-repair canary proves the artifact but not this serving contract, so it cannot arm evaluation.
// Production 2026-09-26 13:20 UTC: the v3 inline endpoint could not accept the full
// container PATCH (RunPod HTTP 422) and its stale gateway rejected BASE_ID with HTTP 409.
// Only a canary observed after the v4 immutable endpoint-generation repair may arm evaluation.
export const MASS_EVALUATION_STANDARD_GATEWAY_REPAIR_AT = '2026-09-26T13:20:32.748Z' as const
export const MASS_EVALUATION_STANDARD_GATEWAY_REPAIR_AT_MS = Date.parse(MASS_EVALUATION_STANDARD_GATEWAY_REPAIR_AT)
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
  | Readonly<{ issue: false; reason: string; considered?: number; skipped?: Readonly<Record<string, number>> }>

const HEX64 = /^[a-f0-9]{64}$/i
const at = (value: string | null | undefined) => Date.parse(String(value || ''))
const evaluationStarted = (event: RollingEvent) => event.evidence?.claim === 'mass_distilled_independent_evaluation_started'
const evaluationTerminal = (event: RollingEvent) => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
  || event.evidence?.claim === 'mass_distilled_independent_evaluation_completed'

/**
 * Baseline HTTP 409 from either exact-artifact gateway means the endpoint container predates the gateway repair.
 * No baseline answer exists, so this is infrastructure evidence and must never consume a student's attempt.
 */
export function staleGatewayModelMismatch(error: unknown): boolean {
  const normalized = String(error || '').trim().toLowerCase()
  return normalized.startsWith('mass_distilled_evaluation_runpod_http_409:baseline:')
    && (normalized.includes('distilled_exact_model_mismatch') || normalized.includes('xsa_exact_model_mismatch'))
}

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
    // The exact-artifact gateway rejecting BASE_ID is serving-contract/runtime drift: no baseline answer exists,
    // so it is infrastructure evidence, never evidence about candidate quality.
    || staleGatewayModelMismatch(error)
    // Production 2026-09-28 audit of every error string this lane has recorded: three more shapes were still
    // charged to model quality even though each is raised BEFORE any model answers a question. 75 events in
    // seven days, three attempts each, so up to 25 artifacts quarantined for our own failures.
    // served_model_unproven: the evaluator could not prove which model the endpoint serves (no proven canary
    // event, or it was invalidated) and stops before the first prompt.
    // deepinfra_harness_cost_reservation_required: our own spend guard declines the call; no judge runs.
    // mass_distilled_runtime_endpoint_id_missing: provisioning never returned an endpoint id, so nothing was
    // ever served. Prefix-matched because the recovery path appends :recovery_from=<id>.
    || error.startsWith('mass_distilled_evaluation_served_model_unproven')
    || error.startsWith('deepinfra_harness_cost_reservation_required')
    || error.startsWith('mass_distilled_runtime_endpoint_id_missing')
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
    // 2026-09-27: Holdout is asked as real exam questions written per withheld essay. An evaluation that starts before
    // those questions exist stops before any model is asked, so it says nothing about model quality. The two
    // interim #3451/#3453 errors below were raised for the same reason (the row itself is not a question) and
    // were never evidence about the model either.
    || error.startsWith('mass_distilled_evaluation_holdout_exam_items_missing')
    || error.startsWith('mass_distilled_evaluation_holdout_not_exam_ready')
    || error.startsWith('mass_distilled_evaluation_holdout_format_unversioned')
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
    // RunPod's own REST/control plane failing (2026-09-27 18:13-18:17 UTC: "RunPod GET /serverless HTTP 500:
    // failed to list endpoints", three times after the helper's own retries) quarantined mass:fce8f4ba without
    // one evaluation prompt ever reaching the artifact. A provider 5xx or 429 on a control-plane call happens
    // before inference and says nothing about model quality. The shape is produced only by our RunPod REST helper.
    || /^runpod (get|post|patch|put|delete) \S+ http (5\d\d|429)\b/.test(error)
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
    const reopenedAfter = candidateEvents.some(event => isEvaluationReopen(event)
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
    .filter(event => isEvaluationReopen(event))
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
    // The first bounded sample still proves the lane, but current anchored-recipe artifacts remain ahead
    // of legacy recipe work after that sample. This is ordering only: retention, canary, scoring, spend,
    // retry, promotion and Production-traffic gates below remain identical.
    const aFrontier = a.frontierRecipe === true
    const bFrontier = b.frontierRecipe === true
    if (aFrontier !== bFrontier) return aFrontier ? -1 : 1
    return at(a.createdAt) - at(b.createdAt)
  })
  // Why each artifact was passed over, so an all-skipped tick is diagnosable from its receipt (2026-09-28: 470
  // consecutive ticks said only 'no eligible artifact' and nothing recorded which rule held ~1,300 artifacts).
  // Observation only: no rule, threshold or authority depends on these counts.
  const skipped: Record<string, number> = {}
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1 }
  for (const artifact of ordered) {
    if (!artifact.candidateId.startsWith('mass:') || !HEX64.test(artifact.artifactHash)) { skip('not_mass_or_bad_hash'); continue }
    if (nowMs - at(artifact.createdAt) < MASS_EVALUATION_RETENTION_DELAY_MS) { skip('younger_than_retention_delay'); continue }
    const hash = artifact.artifactHash.toLowerCase()
    const history = artifactHistory(artifact, input.events, nowMs)
    const mine = history.mine
    const reopenedAt = mine
      .filter(event => isEvaluationReopen(event))
      .map(event => at(event.observedAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] ?? Number.NEGATIVE_INFINITY
    const inCurrentGeneration = history.inCurrentGeneration

    if (history.hasVerdict) { skip('already_has_verdict'); continue }

    const minimumCanaryAt = at(artifact.minimumCanaryObservedAt)
    // Match the atomic claim's exact-canary contract before minting evaluation authority. A generic
    // healthy canary is not enough: claim_next_mass_distilled_evaluation also requires the fine-tune
    // evidence profile, exact artifact hash, internal vLLM readiness and non-expanded authority.
    // Keeping these predicates symmetric prevents approvals that can never be atomically claimed.
    const healthyCanaries = mine
      .filter(event => event.verifier === 'host_production_verifier'
        && event.evidence?.profile === 'cos_university_fine_tune_evidence_v1'
        && event.evidence?.claim === 'production_canary_healthy'
        && event.evidence?.exactArtifact === true
        && String(event.evidence?.artifactHash || '').toLowerCase() === hash
        && event.evidence?.internalVllmReady === true
        && event.evidence?.productionTrafficAuthorized === false
        && event.evidence?.authorityExpanded === false
        && typeof event.evidence?.endpointId === 'string'
        && event.evidence.endpointId.trim().length > 0
        && (!Number.isFinite(minimumCanaryAt) || at(event.observedAt) >= minimumCanaryAt))
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    if (!healthyCanaries.length) { skip('no_exact_healthy_canary'); continue }
    const attentionArchitecture = String(healthyCanaries[0].evidence?.attentionArchitecture || 'standard_attention')
    if (attentionArchitecture === 'standard_attention'
      && at(healthyCanaries[0].observedAt) < MASS_EVALUATION_STANDARD_GATEWAY_REPAIR_AT_MS) { skip('standard_canary_before_gateway_repair'); continue }

    // Production 2026-09-24: an artifact had a valid canary pass at 14:07, then a later endpoint-refresh
    // canary failed at 19:55 with mass_distilled_runtime_worker_not_ready. The evaluator authorization
    // still accepted the stale healthy proof and repeatedly reused the dead endpoint. A newer failed
    // exact-runtime canary invalidates every older healthy/pass proof until another canary passes.
    const newestHealthyAt = at(healthyCanaries[0].observedAt)
    const runtimeTerminals = mine
      .filter(event => event.verifier === 'host_controller'
        && (event.evidence?.claim === 'local_distilled_runtime_canary_passed'
          || event.evidence?.claim === 'local_distilled_runtime_canary_failed')
        && (!Number.isFinite(minimumCanaryAt) || at(event.observedAt) >= minimumCanaryAt))
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    const newestRuntimeTerminal = runtimeTerminals[0]
    if (newestRuntimeTerminal
      && at(newestRuntimeTerminal.observedAt) > newestHealthyAt
      && newestRuntimeTerminal.evidence?.claim !== 'local_distilled_runtime_canary_passed') { skip('newer_canary_failed'); continue }

    // A stale gateway cannot run the pinned baseline. Do not wake the same stale endpoint again; the canary lane
    // re-canaries this artifact onto a fresh endpoint, and a newer healthy canary lifts this skip.
    const newestFailureSinceCanary = mine
      .filter(event => event.evidence?.claim === 'mass_distilled_independent_evaluation_failed'
        && at(event.observedAt) > newestHealthyAt)
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))[0]
    if (newestFailureSinceCanary && staleGatewayModelMismatch(newestFailureSinceCanary.evidence?.error)) {
      skip('stale_gateway_awaiting_fresh_canary'); continue
    }

    // The atomic claim serializes execution, but authorization runs more often than long evaluations complete.
    // Do not mint another approval while this exact artifact already has a live started reservation.
    if (history.liveStart) { skip('exam_already_running'); continue }

    const failures = history.substantiveFailures
    if (failures >= MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) { skip('failed_attempts_exhausted'); continue }

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
        if (!Number.isFinite(observedAt)) return true
        if (observedAt < MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT_MS
          && error.includes(RUNPOD_QUOTA_FAILURE_FRAGMENT)) return false
        if (observedAt < MASS_EVALUATION_MODEL_READY_REPAIR_AT_MS
          && error.startsWith(RUNTIME_NOT_READY_FAILURE_PREFIX)) return false
        if (observedAt < MASS_EVALUATION_PING_200_REPAIR_AT_MS
          && error === 'mass_distilled_evaluation_runtime_not_ready:200') return false
        return true
      })
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    // Fairness floor: any newest infrastructure/control-plane failure yields this artifact briefly so
    // the scheduler can try another eligible artifact. Different infrastructure error strings do not erase
    // the floor. Substantive model-quality failures do not enter this branch and retain their separate budget.
    const newestFailure = recentFailures[0]
    if (newestFailure && evaluatorInfrastructureFailure(newestFailure)) {
      const newestFailureAt = at(newestFailure.observedAt)
      if (!Number.isFinite(newestFailureAt)) { skip('infra_failure_time_unreadable'); continue }
      if (nowMs - newestFailureAt < MASS_EVALUATION_INFRASTRUCTURE_FAILURE_MIN_COOLDOWN_MS) { skip('infra_failure_cooldown_10m'); continue }
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
        if (!Number.isFinite(newestFailureAt)) { skip('identical_failure_time_unreadable'); continue }
        if (nowMs - newestFailureAt < identicalInfrastructureFailureCooldownMs(identical)) { skip('identical_failure_cooldown'); continue }
      }
    }

    const controls = mine
      .filter(event => inCurrentGeneration(event) && event.verifier === 'host_controller'
        && (event.evidence?.claim === 'distilled_independent_evaluation_approved' || event.evidence?.claim === 'distilled_independent_evaluation_suspended'))
      .sort((a, b) => at(b.observedAt) - at(a.observedAt))
    const latest = controls[0]
    const repairedSuspension = latest?.evidence?.claim === 'distilled_independent_evaluation_suspended'
      && String(latest.evidence?.reason || '') === REPAIRED_SUSPENSION_REASON
    if (latest?.evidence?.claim === 'distilled_independent_evaluation_suspended' && !repairedSuspension) { skip('approval_suspended'); continue }
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
      if (!staleCeiling && !startedAfter && at(latest.expiresAt) > nowMs) { skip('approval_already_armed'); continue }
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
        ...(artifact.frontierRecipe === true ? { currentRecipePriority: true } : {}),
        ...(repairedSuspension ? { resumeAfterSuspension: true, repairRef: MASS_EVALUATION_24GB_REPAIR_REF } : {}),
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation', considered: ordered.length, skipped: Object.freeze(skipped) }
}
