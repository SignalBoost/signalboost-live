// saas/tests/cosUniversityMassEvaluationRollingAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT,
  MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE,
  MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE,
  MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
  MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  MASS_EVALUATION_MAX_IN_FLIGHT,
  MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF,
  MASS_EVALUATION_REOPEN_CLAIM,
  MASS_EVALUATION_ROLLING_MAX_APPROVALS,
  MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT,
  MASS_EVALUATION_MODEL_READY_REPAIR_AT,
  decideRollingMassEvaluationApproval,
  type RollingEvent,
} from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_EVALUATION_ENDPOINT_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const now = new Date('2026-09-16T16:50:00Z')
const hashA = '7f23dde5'.padEnd(64, 'a')
const hashB = '8cea7b8f'.padEnd(64, 'b')
const artifactA = { candidateId: 'mass:cs:1', subjectId: 'Computer Science & Coding', artifactHash: hashA, createdAt: '2026-09-15T22:34:00Z' }
const artifactB = { candidateId: 'mass:cyber:1', subjectId: 'Cybersecurity', artifactHash: hashB, createdAt: '2026-09-15T18:26:00Z' }
const ev = (candidateId: string, verifier: string, evidence: Record<string, unknown>, observedAt = '2026-09-16T10:00:00Z', expiresAt: string | null = null): RollingEvent => ({ candidateId, verifier, evidence, observedAt, expiresAt })
const canary = (a: typeof artifactA) => ev(a.candidateId, 'host_production_verifier', { claim: 'production_canary_healthy', artifactHash: a.artifactHash, exactArtifact: true, productionTrafficAuthorized: false })

test('rolling throughput ceiling matches the owner-approved backlog-drain budget', () => {
  assert.equal(MASS_EVALUATION_ROLLING_MAX_APPROVALS, 300)
  // 300 approvals * the unchanged $0.20 per-evaluation wake ceiling = $60/day maximum authorization.
  // This test pins throughput authority; the per-evaluation claim test below pins the $0.20 boundary itself.
})


test('provider worker quota reserves one worker of canary headroom by capping evaluator admission at two active leases', () => {
  assert.equal(MASS_EVALUATION_MAX_IN_FLIGHT, 2)
  const full = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA)],
    now,
    inFlightCount: MASS_EVALUATION_MAX_IN_FLIGHT,
  })
  assert.equal(full.issue, false)
  assert.equal(!full.issue && full.reason, 'mass_evaluation_concurrency_full')

  const available = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA)],
    now,
    inFlightCount: MASS_EVALUATION_MAX_IN_FLIGHT - 1,
  })
  assert.equal(available.issue, true)
})

test('frontier proof sampling is bounded and then returns to oldest-first order', () => {
  assert.equal(MASS_EVALUATION_FRONTIER_PROOF_SAMPLE, 4)
  const legacy = { ...artifactB, createdAt: '2026-09-14T18:26:00Z' }
  const frontier = { ...artifactA, candidateId: 'mass:frontier:1', artifactHash: '9'.repeat(64), createdAt: '2026-09-15T22:34:00Z', frontierRecipe: true }
  const frontierCanary = ev(frontier.candidateId, 'host_production_verifier', { claim: 'production_canary_healthy', artifactHash: frontier.artifactHash, exactArtifact: true, productionTrafficAuthorized: false })

  const proof = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, frontier],
    events: [canary(legacy as typeof artifactA), frontierCanary],
    now,
    frontierProofCompletions: 0,
  })
  assert.equal(proof.issue && proof.artifact.candidateId, frontier.candidateId)

  const normal = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, frontier],
    events: [canary(legacy as typeof artifactA), frontierCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
  })
  assert.equal(normal.issue && normal.artifact.candidateId, legacy.candidateId)
})

test('confirmed v2 Computer Science proof sampling outranks legacy work only until two durable results exist', () => {
  assert.equal(MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE, 2)
  const legacy = { ...artifactB, createdAt: '2026-09-14T18:26:00Z' }
  const builderV2 = {
    ...artifactA,
    candidateId: 'mass:builder-v2:1',
    artifactHash: '6'.repeat(64),
    createdAt: '2026-09-15T22:34:00Z',
    frontierRecipe: true,
    builderV2: true,
  }
  const builderCanary = ev(builderV2.candidateId, 'host_production_verifier', {
    claim: 'production_canary_healthy',
    artifactHash: builderV2.artifactHash,
    exactArtifact: true,
    productionTrafficAuthorized: false,
  })

  const proof = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, builderV2],
    events: [canary(legacy as typeof artifactA), builderCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
    builderV2ProofCompletions: 0,
  })
  assert.equal(proof.issue && proof.artifact.candidateId, builderV2.candidateId)

  const normal = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, builderV2],
    events: [canary(legacy as typeof artifactA), builderCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
    builderV2ProofCompletions: MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE,
  })
  assert.equal(normal.issue && normal.artifact.candidateId, legacy.candidateId)
})

test('post-GKD remediation replay proof sampling is bounded and never bypasses the 12-hour delay', () => {
  assert.equal(MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE, 2)
  const legacy = { ...artifactB, createdAt: '2026-09-14T18:26:00Z' }
  const replay = {
    ...artifactA,
    candidateId: 'mass:replay-proof:1',
    artifactHash: '4'.repeat(64),
    createdAt: '2026-09-15T22:34:00Z',
    remediationReplay: true,
  }
  const replayCanary = ev(replay.candidateId, 'host_production_verifier', {
    claim: 'production_canary_healthy',
    artifactHash: replay.artifactHash,
    exactArtifact: true,
    productionTrafficAuthorized: false,
  })
  const proof = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, replay],
    events: [canary(legacy as typeof artifactA), replayCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
    builderV2ProofCompletions: MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE,
    remediationReplayProofCompletions: 0,
  })
  assert.equal(proof.issue && proof.artifact.candidateId, replay.candidateId)
  if (proof.issue) assert.equal(proof.evidence.remediationReplayProofPriority, true)

  const normal = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, replay],
    events: [canary(legacy as typeof artifactA), replayCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
    builderV2ProofCompletions: MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE,
    remediationReplayProofCompletions: MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE,
  })
  assert.equal(normal.issue && normal.artifact.candidateId, legacy.candidateId)

  const freshReplay = { ...replay, candidateId: 'mass:replay-proof:fresh', artifactHash: '3'.repeat(64), createdAt: '2026-09-16T10:00:00Z' }
  const freshCanary = ev(freshReplay.candidateId, 'host_production_verifier', {
    claim: 'production_canary_healthy',
    artifactHash: freshReplay.artifactHash,
    exactArtifact: true,
    productionTrafficAuthorized: false,
  })
  const retained = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, freshReplay],
    events: [canary(legacy as typeof artifactA), freshCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
    builderV2ProofCompletions: MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE,
    remediationReplayProofCompletions: 0,
  })
  assert.equal(retained.issue && retained.artifact.candidateId, legacy.candidateId)
})

test('v2 Builder evaluation priority never bypasses the 12-hour retention delay', () => {
  const legacy = { ...artifactB, createdAt: '2026-09-14T18:26:00Z' }
  const freshBuilder = {
    ...artifactA,
    candidateId: 'mass:builder-v2:fresh',
    artifactHash: '5'.repeat(64),
    createdAt: '2026-09-16T10:00:00Z',
    builderV2: true,
  }
  const freshCanary = ev(freshBuilder.candidateId, 'host_production_verifier', {
    claim: 'production_canary_healthy',
    artifactHash: freshBuilder.artifactHash,
    exactArtifact: true,
    productionTrafficAuthorized: false,
  })
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, freshBuilder],
    events: [canary(legacy as typeof artifactA), freshCanary],
    now,
    frontierProofCompletions: MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
    builderV2ProofCompletions: 0,
  })
  assert.equal(decision.issue && decision.artifact.candidateId, legacy.candidateId)
})

test('an infrastructure-failed frontier start remains proof-prioritized until a real result exists', () => {
  const legacy = { ...artifactB, createdAt: '2026-09-14T18:26:00Z' }
  const frontier = { ...artifactA, candidateId: 'mass:frontier:retry', artifactHash: '7'.repeat(64), createdAt: '2026-09-15T22:34:00Z', frontierRecipe: true }
  const frontierCanary = ev(frontier.candidateId, 'host_production_verifier', { claim: 'production_canary_healthy', artifactHash: frontier.artifactHash, exactArtifact: true, productionTrafficAuthorized: false })
  const priorApproval = ev(frontier.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    artifactHash: frontier.artifactHash,
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
  }, '2026-09-16T14:00:00Z', '2026-09-16T15:00:00Z')
  const priorStart = ev(frontier.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: frontier.artifactHash,
  }, '2026-09-16T14:00:10Z', '2026-09-16T14:12:10Z')
  const infraFailure = ev(frontier.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: frontier.artifactHash,
    error: 'mass_distilled_evaluation_runtime_not_ready:network',
  }, '2026-09-16T14:05:00Z')

  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [legacy, frontier],
    events: [canary(legacy as typeof artifactA), frontierCanary, priorApproval, priorStart, infraFailure],
    now,
    frontierProofCompletions: 1,
  })
  assert.equal(decision.issue && decision.artifact.candidateId, frontier.candidateId)
})

test('cron scans bounded legacy work and explicitly includes both Builder v2 and remediation replay proof cohorts', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const \[oldestArtifacts, builderV2Artifacts, replayArtifacts\] = await Promise\.all/)
  assert.match(route, /\.limit\(500\)/)
  assert.match(route, /\.eq\('subject_id', 'Computer Science & Coding'\)/)
  assert.match(route, /optimizer: MASS_EVALUATION_BUILDER_V2_OPTIMIZER/)
  assert.match(route, /frontierRecipe: receipt\.profile === 'cos_university_frontier_gkd_v1'/)
  assert.match(route, /builderV2:/)
  assert.match(route, /remediationReplay: isRemediationReplayReceipt/)
  assert.match(route, /failureDerivedReplayRequired/)
  assert.match(route, /failureDerivedReplayItems/)
  assert.match(route, /frontierResponseAnchorItems/)
  assert.match(route, /cos_university_distilled_evaluation_runs/)
  assert.match(route, /builderV2ProofCompletions = new Set/)
  assert.match(route, /remediationReplayProofCompletions = new Set/)
  assert.match(route, /frontierProofCompletions = new Set/)
  assert.match(route, /MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE/)
  assert.match(route, /MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE/)
  assert.match(route, /MASS_EVALUATION_FRONTIER_PROOF_SAMPLE/)
})

test('cron reserves replay canary headroom only while durable replay proof is incomplete and an evaluator is active', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvisionV2.ts', import.meta.url), 'utf8')
  const durableProof = route.indexOf('let remediationReplayProofCompletions')
  const headroom = route.indexOf("reason: 'replay_canary_runpod_headroom_reserved'")
  assert.ok(durableProof >= 0 && headroom > durableProof)
  assert.match(route, /remediationReplayProofCompletions < MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE/)
  assert.match(route, /remediationReplayCanaryPasses < MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE/)
  assert.match(route, /massDistilledServerlessWorkerCapacity/)
  assert.match(route, /capacity\.availableWorkers <= 1 && inFlightCount > 0/)
  assert.match(provision, /export async function massDistilledServerlessWorkerCapacity/)
  assert.match(provision, /reservedWorkers/)
  assert.match(provision, /availableWorkers/)
  assert.match(provision, /RUNPOD_SERVERLESS_WORKER_QUOTA \|\| '10'/)
})

test('issues exactly the claim-compatible shape for a canary-proven artifact past the 12h retention delay', () => {
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA)], now })
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.maxEndpointCalls, MASS_EVALUATION_ENDPOINT_CALLS)
  assert.equal(decision.evidence.maxJudgeCalls, 4)
  assert.equal(decision.evidence.maxRuntimeWakeAttempts, 1)
  assert.equal(decision.evidence.maxEstimatedRuntimeWakeCostUsd, 0.2)
  assert.equal(decision.evidence.productionTrafficAuthorized, false)
  assert.equal(decision.evidence.authorityExpanded, false)
  assert.equal(decision.evidence.authorizationRef, MASS_EVALUATION_ROLLING_AUTHORIZATION_REF)
})

test('no canary, too fresh, disabled, or already has a verdict means no approval', () => {
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [], now }).issue, false)
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [{ ...artifactA, createdAt: '2026-09-16T10:00:00Z' }], events: [canary(artifactA)], now }).issue, false)
  assert.equal(decideRollingMassEvaluationApproval({ enabled: false, artifacts: [artifactA], events: [canary(artifactA)], now }).issue, false)
  const verdict = ev(artifactA.candidateId, 'independent_scorer', { claim: 'independent_evaluation', artifactHash: hashA })
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), verdict], now }).issue, false)
})

test('an armed approval or an owner suspension blocks a new one; a consumed approval does not', () => {
  const armed = ev(artifactA.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hashA }, '2026-09-16T16:37:00Z', '2026-09-16T18:37:00Z')
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), armed], now }).issue, false)
  const started = ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: hashA }, '2026-09-16T16:40:21Z')
  const failed = ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashA }, '2026-09-16T16:43:00Z')
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), armed, started, failed], now }).issue, true)
  const suspended = ev(artifactA.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_suspended', artifactHash: hashA }, '2026-09-16T16:45:00Z')
  assert.equal(decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), armed, started, failed, suspended], now }).issue, false)
})

test('the repaired 502 diagnostic suspension may resume only through the bounded post-2398 rolling approval', () => {
  const suspended = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_suspended',
    artifactHash: hashA,
    reason: 'candidate_502_pending_runpod_worker_logs',
  }, '2026-09-16T16:45:00Z')
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), suspended], now })
  assert.equal(decision.issue, true)
  if (!decision.issue) return
  assert.equal(decision.evidence.resumeAfterSuspension, true)
  assert.equal(decision.evidence.repairRef, 'pr_2398_24gb_evaluator_preflight')
  assert.equal(decision.evidence.maxEndpointCalls, MASS_EVALUATION_ENDPOINT_CALLS)
  assert.equal(decision.evidence.maxEstimatedRuntimeWakeCostUsd, 0.2)
  assert.equal(decision.evidence.productionTrafficAuthorized, false)
})

test('three substantive failures of rolling attempts stop automatic retries, and the next eligible artifact is chosen oldest first', () => {
  const rollingApproval = ev(artifactB.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hashB, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-16T09:00:00Z', '2026-09-16T11:00:00Z')
  const failures = Array.from({ length: MASS_EVALUATION_MAX_FAILED_ATTEMPTS_PER_ARTIFACT }, (_, i) =>
    ev(artifactB.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashB, error: 'mass_distilled_evaluation_judge_json_invalid' }, `2026-09-16T1${i}:00:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA, artifactB], events: [canary(artifactA), canary(artifactB), rollingApproval, ...failures], now })
  assert.equal(decision.issue && decision.artifact.candidateId, artifactA.candidateId)
})

test('evaluator infrastructure failures do not exhaust the artifact retry budget', () => {
  const rollingApproval = ev(artifactA.candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', artifactHash: hashA, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF }, '2026-09-16T09:00:00Z', '2026-09-16T11:00:00Z')
  const failures = [
    'mass_distilled_evaluation_context_budget_insufficient:cases=8:estimatedPromptTokens=9138',
    'mass_distilled_evaluation_endpoint_call_ceiling:0+2+15>14',
    "mass_distilled_evaluation_runpod_http_400:baseline:cases=8:{\"error\":{\"message\":\"This model's maximum context length is 8192 tokens\"}}",
    'The operation was aborted due to timeout',
    'mass_distilled_evaluation_runpod_http_502:baseline:cases=4:gateway',
    'mass_distilled_evaluation_answer_missing:0a546e1b26656083',
    'mass_distilled_evaluation_holdout_format_invalid',
    'mass_distilled_evaluation_legacy_hosted_prompt_binding_missing',
    'mass_distilled_evaluation_runtime_not_ready:204',
  ].map((error, i) => ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashA, error }, `2026-09-16T1${i}:00:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), rollingApproval, ...failures], now })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})

test('failures of earlier hand-approved attempts do not use up the automatic retry budget', () => {
  const handFailures = Array.from({ length: 3 }, (_, i) =>
    ev(artifactA.candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: hashA }, `2026-09-16T1${i}:43:00Z`))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...handFailures], now })
  assert.equal(decision.issue, true)
})

test('the rolling window caps approvals per 24 hours', () => {
  const issued = Array.from({ length: MASS_EVALUATION_ROLLING_MAX_APPROVALS }, (_, i) =>
    ev(`mass:x:${i}`, 'host_controller', { claim: 'distilled_independent_evaluation_approved', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, artifactHash: 'c'.repeat(64) }, '2026-09-16T12:00:00Z'))
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...issued], now })
  assert.equal(decision.issue, false)
  assert.equal(!decision.issue && decision.reason, 'rolling_mass_evaluation_window_exhausted')
})

test('infrastructure-failed approvals are released from the rolling window while in-flight approvals still count', () => {
  const infraEvents: RollingEvent[] = []
  for (let i = 0; i < MASS_EVALUATION_ROLLING_MAX_APPROVALS; i++) {
    const candidateId = `mass:infra:${i}`
    const minute = String(i).padStart(2, '0')
    infraEvents.push(ev(candidateId, 'host_controller', { claim: 'distilled_independent_evaluation_approved', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, artifactHash: 'd'.repeat(64) }, `2026-09-16T12:${minute}:00Z`, `2026-09-16T14:${minute}:00Z`))
    infraEvents.push(ev(candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_started', artifactHash: 'd'.repeat(64) }, `2026-09-16T12:${minute}:10Z`))
    infraEvents.push(ev(candidateId, 'host_controller', { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: 'd'.repeat(64), error: i % 2 ? 'mass_distilled_evaluation_runpod_http_502:candidate:cases=4:gateway' : 'mass_distilled_evaluation_answer_missing:case' }, `2026-09-16T12:${minute}:20Z`))
  }
  const decision = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...infraEvents], now })
  assert.equal(decision.issue, true)

  const armed = Array.from({ length: MASS_EVALUATION_ROLLING_MAX_APPROVALS }, (_, i) =>
    ev(`mass:armed:${i}`, 'host_controller', { claim: 'distilled_independent_evaluation_approved', authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, artifactHash: 'e'.repeat(64) }, '2026-09-16T12:00:00Z', '2026-09-16T18:00:00Z'))
  const blocked = decideRollingMassEvaluationApproval({ enabled: true, artifacts: [artifactA], events: [canary(artifactA), ...armed], now })
  assert.equal(blocked.issue, false)
  assert.equal(!blocked.issue && blocked.reason, 'rolling_mass_evaluation_window_exhausted')
})

test('the cron may drain already-issued bounded approvals while preserving the authorization kill switch', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const rolling = route.indexOf('await ensureRollingMassEvaluationApproval()')
  const drain = route.indexOf('const mayDrainExistingApproval')
  const denial = route.indexOf('if (!rolling.issued && !mayDrainExistingApproval)')
  const claim = route.indexOf('claim = await claimNext()')
  assert.ok(rolling >= 0 && drain > rolling && denial > drain && claim > denial)
  assert.match(route, /rolling\.reason === 'no_mass_artifact_eligible_for_rolling_evaluation'/)
  assert.match(route, /rolling\.reason === 'rolling_mass_evaluation_window_exhausted'/)
  assert.match(route, /if \(!rolling\.issued && !mayDrainExistingApproval\)/)
  assert.match(route, /enabled: process\.env\.COS_MASS_EVALUATION_ROLLING_AUTHORIZATION !== 'false'/)
  assert.match(route, /db\.rpc\('claim_next_mass_distilled_evaluation'\)/)
  assert.match(route, /maxEndpointCalls/)
  assert.match(route, /maxJudgeCalls/)
  assert.match(route, /maxRuntimeWakeAttempts/)
})

test('an event returned by both cron reads is counted once, so two real failures cannot trip the three-failure stop', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.equal((route.match(/\.select\('event_key,candidate_id,observed_at,expires_at,verifier,evidence'\)/g) || []).length, 2)
  assert.match(route, /seenEventKeys\.has\(key\)/)
  assert.match(route, /const all: RollingEvent\[\] = uniqueRows\.map/)
})

test('an evaluator crash does not spend an artifact\'s substantive attempts', () => {
  // 2026-09-17: three attempts on mass:481a6760 were consumed by our own TypeError and by wake-contract errors,
  // leaving a healthy artifact permanently unevaluated.
  const artifact = { candidateId: 'mass:481a6760', subjectId: 'computer_science', artifactHash: 'b'.repeat(64), createdAt: '2026-09-16T10:00:00.000Z' }
  const approval = (observedAt: string) => ({
    candidateId: artifact.candidateId, observedAt, expiresAt: '2026-09-17T12:00:00.000Z', verifier: 'host_controller',
    evidence: { claim: 'distilled_independent_evaluation_approved', artifactHash: artifact.artifactHash, authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF },
  })
  const failure = (observedAt: string, error: string) => ({
    candidateId: artifact.candidateId, observedAt, expiresAt: null, verifier: 'host_controller',
    evidence: { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: artifact.artifactHash, error },
  })
  const canary = {
    candidateId: artifact.candidateId, observedAt: '2026-09-17T17:27:00.000Z', expiresAt: null, verifier: 'host_production_verifier',
    evidence: { claim: 'production_canary_healthy', artifactHash: artifact.artifactHash, exactArtifact: true, productionTrafficAuthorized: false },
  }
  const events = [
    canary,
    approval('2026-09-17T20:01:00.000Z'), failure('2026-09-17T20:02:00.000Z', "Cannot read properties of undefined (reading 'length')"),
    approval('2026-09-17T20:10:00.000Z'), failure('2026-09-17T20:11:00.000Z', "Cannot read properties of undefined (reading 'length')"),
    approval('2026-09-17T20:20:00.000Z'), failure('2026-09-17T20:21:00.000Z', 'mass_distilled_evaluation_runtime_wake_http_404:{"detail":"Not Found"}'),
  ]
  const decision = decideRollingMassEvaluationApproval({
    artifacts: [artifact], events, now: new Date('2026-09-17T20:40:00.000Z'), enabled: true,
  } as Parameters<typeof decideRollingMassEvaluationApproval>[0])
  assert.ok('artifact' in decision, `expected a new approval, got ${JSON.stringify(decision)}`)
  assert.equal(decision.artifact.candidateId, 'mass:481a6760')
})

test('the same infrastructure failure repeating on one artifact stops instead of looping', () => {
  // mass:8f5af666, 2026-09-17 21:06-21:12 UTC: one truncated case reproduced every two minutes, waking paid compute.
  const artifact = { candidateId: 'mass:8f5af666', subjectId: 'economics_finance', artifactHash: 'd'.repeat(64), createdAt: '2026-09-14T19:12:00.000Z' }
  const canary = {
    candidateId: artifact.candidateId, observedAt: '2026-09-16T10:00:00.000Z', expiresAt: null, verifier: 'host_production_verifier',
    evidence: { claim: 'production_canary_healthy', artifactHash: artifact.artifactHash, exactArtifact: true, productionTrafficAuthorized: false },
  }
  const failure = (minute: number, error: string) => ({
    candidateId: artifact.candidateId, observedAt: `2026-09-17T21:${String(minute).padStart(2, '0')}:00.000Z`, expiresAt: null, verifier: 'host_controller',
    evidence: { claim: 'mass_distilled_independent_evaluation_failed', artifactHash: artifact.artifactHash, error },
  })
  const truncated = 'mass_distilled_evaluation_answer_missing:0ee6ecdba3940d76:finish=length'
  const now = new Date('2026-09-17T21:20:00.000Z')
  const repeated = [canary, failure(6, truncated), failure(8, truncated), failure(10, truncated), failure(12, truncated)]
  assert.deepEqual(
    decideRollingMassEvaluationApproval({ artifacts: [artifact], events: repeated, now, enabled: true } as Parameters<typeof decideRollingMassEvaluationApproval>[0]),
    { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' },
  )
  // Three identical failures still retry, and a different newest failure resets the count.
  const three = [canary, failure(6, truncated), failure(8, truncated), failure(10, truncated)]
  assert.ok('artifact' in decideRollingMassEvaluationApproval({ artifacts: [artifact], events: three, now, enabled: true } as Parameters<typeof decideRollingMassEvaluationApproval>[0]))
  const different = [...repeated, failure(14, 'mass_distilled_evaluation_runtime_not_ready:network')]
  assert.ok('artifact' in decideRollingMassEvaluationApproval({ artifacts: [artifact], events: different, now, enabled: true } as Parameters<typeof decideRollingMassEvaluationApproval>[0]))
})


test('pre-repair RunPod quota failures do not keep repaired artifacts in the old cooldown generation', () => {
  assert.equal(MASS_EVALUATION_RUNPOD_QUOTA_REPAIR_AT, '2026-09-24T16:00:00.000Z')
  const artifact = {
    ...artifactB,
    candidateId: 'mass:quota-repair:1',
    artifactHash: '1'.repeat(64),
    createdAt: '2026-09-20T15:00:00.000Z',
  }
  const quotaError = 'RunPod PATCH /serverless/example HTTP 400: Max workers across all endpoints must not exceed your workers quota (10).'
  const events: RollingEvent[] = [
    ev(artifact.candidateId, 'host_production_verifier', {
      claim: 'production_canary_healthy',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-24T13:00:00.000Z'),
  ]
  for (let i = 0; i < 5; i += 1) {
    const minute = 47 + i * 2
    events.push(ev(artifact.candidateId, 'host_controller', {
      claim: 'distilled_independent_evaluation_approved',
      artifactHash: artifact.artifactHash,
      authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    }, `2026-09-24T15:${String(minute).padStart(2, '0')}:00.000Z`, `2026-09-24T17:${String(minute).padStart(2, '0')}:00.000Z`))
    events.push(ev(artifact.candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_started',
      artifactHash: artifact.artifactHash,
    }, `2026-09-24T15:${String(minute).padStart(2, '0')}:05.000Z`))
    events.push(ev(artifact.candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash: artifact.artifactHash,
      error: quotaError,
    }, `2026-09-24T15:${String(minute).padStart(2, '0')}:10.000Z`))
  }

  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-24T16:20:00.000Z'),
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.artifact.candidateId, artifact.candidateId)
})


test('pre-repair runtime-not-ready failures do not keep the repaired evaluator in the old cooldown generation', () => {
  assert.equal(MASS_EVALUATION_MODEL_READY_REPAIR_AT, '2026-09-24T19:26:08.571Z')
  const artifact = {
    ...artifactB,
    candidateId: 'mass:model-ready-repair:1',
    artifactHash: '3'.repeat(64),
    createdAt: '2026-09-20T15:00:00.000Z',
  }
  const events: RollingEvent[] = [
    ev(artifact.candidateId, 'host_production_verifier', {
      claim: 'production_canary_healthy',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-24T14:07:24.000Z'),
  ]
  for (let i = 0; i < 6; i += 1) {
    const minute = 10 + i * 2
    events.push(ev(artifact.candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash: artifact.artifactHash,
      error: 'mass_distilled_evaluation_runtime_not_ready:200',
    }, `2026-09-24T19:${String(minute).padStart(2, '0')}:00.000Z`))
  }
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-24T19:27:00.000Z'),
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.artifact.candidateId, artifact.candidateId)
})


test('a newer failed runtime canary invalidates an older healthy proof until a fresh pass exists', () => {
  const artifact = {
    ...artifactA,
    candidateId: 'mass:stale-canary:1',
    artifactHash: '5'.repeat(64),
    createdAt: '2026-09-20T05:00:00.000Z',
  }
  const events: RollingEvent[] = [
    ev(artifact.candidateId, 'host_controller', {
      claim: 'local_distilled_runtime_canary_passed',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      endpointId: 'deadendpoint',
    }, '2026-09-24T14:07:24.000Z'),
    ev(artifact.candidateId, 'host_production_verifier', {
      claim: 'production_canary_healthy',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-24T14:07:25.000Z'),
    ev(artifact.candidateId, 'host_controller', {
      claim: 'local_distilled_runtime_canary_failed',
      artifactHash: artifact.artifactHash,
      endpointId: 'deadendpoint',
      error: 'mass_distilled_runtime_worker_not_ready',
    }, '2026-09-24T19:55:40.000Z'),
  ]
  const blocked = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-24T20:11:00.000Z'),
  })
  assert.deepEqual(blocked, { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' })

  events.push(
    ev(artifact.candidateId, 'host_controller', {
      claim: 'local_distilled_runtime_canary_passed',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      endpointId: 'freshendpoint',
    }, '2026-09-24T20:20:00.000Z'),
    ev(artifact.candidateId, 'host_production_verifier', {
      claim: 'production_canary_healthy',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-24T20:20:01.000Z'),
  )
  const released = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-24T20:21:00.000Z'),
  })
  assert.equal(released.issue, true)
})

test('post-repair runtime-not-ready failures still retain the normal infrastructure cooldown', () => {
  const artifact = {
    ...artifactB,
    candidateId: 'mass:model-ready-repair:2',
    artifactHash: '4'.repeat(64),
    createdAt: '2026-09-20T15:00:00.000Z',
  }
  const events: RollingEvent[] = [
    ev(artifact.candidateId, 'host_production_verifier', {
      claim: 'production_canary_healthy',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-24T19:26:09.000Z'),
    ev(artifact.candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash: artifact.artifactHash,
      error: 'mass_distilled_evaluation_runtime_not_ready:200',
    }, '2026-09-24T19:27:00.000Z'),
  ]
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-24T19:30:00.000Z'),
  })
  assert.deepEqual(decision, { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' })
})

test('post-repair RunPod quota failures still retain the normal infrastructure cooldown', () => {
  const artifact = {
    ...artifactB,
    candidateId: 'mass:quota-repair:2',
    artifactHash: '2'.repeat(64),
    createdAt: '2026-09-20T15:00:00.000Z',
  }
  const quotaError = 'RunPod PATCH /serverless/example HTTP 400: Max workers across all endpoints must not exceed your workers quota (10).'
  const events: RollingEvent[] = [
    ev(artifact.candidateId, 'host_production_verifier', {
      claim: 'production_canary_healthy',
      artifactHash: artifact.artifactHash,
      exactArtifact: true,
      productionTrafficAuthorized: false,
    }, '2026-09-24T16:01:00.000Z'),
    ev(artifact.candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash: artifact.artifactHash,
      error: quotaError,
    }, '2026-09-24T16:18:00.000Z'),
  ]
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifact],
    events,
    now: new Date('2026-09-24T16:20:00.000Z'),
  })
  assert.deepEqual(decision, { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_evaluation' })
})

test('RunPod max-worker quota preflight failures do not consume the paid evaluation rolling window', () => {
  const infraEvents: RollingEvent[] = []
  for (let i = 0; i < MASS_EVALUATION_ROLLING_MAX_APPROVALS; i++) {
    const candidateId = `mass:quota:${i}`
    const minute = String(i).padStart(2, '0')
    const artifactHash = 'f'.repeat(64)
    infraEvents.push(ev(candidateId, 'host_controller', {
      claim: 'distilled_independent_evaluation_approved',
      authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
      artifactHash,
    }, `2026-09-16T12:${minute}:00Z`, `2026-09-16T14:${minute}:00Z`))
    infraEvents.push(ev(candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_started',
      artifactHash,
    }, `2026-09-16T12:${minute}:10Z`, `2026-09-16T14:${minute}:10Z`))
    infraEvents.push(ev(candidateId, 'host_controller', {
      claim: 'mass_distilled_independent_evaluation_failed',
      artifactHash,
      error: 'RunPod PATCH /serverless/example HTTP 400: Max workers across all endpoints must not exceed your workers quota (10).',
    }, `2026-09-16T12:${minute}:20Z`))
  }
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), ...infraEvents],
    now,
  })
  assert.equal(decision.issue, true)
})


test('unknown or disabled rolling denial still exits before atomic claim, but armed queue states reach the claim path', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const denial = route.indexOf('if (!rolling.issued && !mayDrainExistingApproval)')
  const claim = route.indexOf('claim = await claimNext()')
  const preflight = route.indexOf('ensureMassDistilledEndpoint24Gb(claim.endpointId)')
  const wake = route.indexOf('wakeMassDistilledRuntime(claim.endpointId')
  assert.ok(denial >= 0 && claim > denial && preflight > claim && wake > preflight)
  assert.match(route, /return NextResponse\.json\(\{ ok: true, skipped: true, reason: rolling\.reason \}\)/)
  assert.match(route, /mayDrainExistingApproval = !rolling\.issued/)
  assert.doesNotMatch(route, /rolling\.reason === 'rolling_mass_evaluation_authorization_disabled'\s*\|\|/)
})


test('holdout format failures are evaluator infrastructure and do not consume model retry or rolling-window authority', () => {
  const approval = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hashA,
  }, '2026-09-16T12:00:00Z', '2026-09-16T14:00:00Z')
  const started = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: hashA,
  }, '2026-09-16T12:00:10Z', '2026-09-16T12:12:10Z')
  const failed = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hashA,
    error: 'mass_distilled_evaluation_holdout_format_invalid',
  }, '2026-09-16T12:00:20Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), approval, started, failed],
    now,
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})


test('moving-head holdout revision failures are evaluator infrastructure and release rolling authority', () => {
  const approval = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hashA,
  }, '2026-09-20T08:29:00Z', '2026-09-20T10:29:00Z')
  const started = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: hashA,
  }, '2026-09-20T08:29:10Z', '2026-09-20T08:41:10Z')
  const failed = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hashA,
    error: 'mass_distilled_evaluation_holdout_revision_moved',
  }, '2026-09-20T08:29:20Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), approval, started, failed],
    now: new Date('2026-09-20T15:40:00Z'),
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})


test('rolling approval evidence is candidate-scoped and paginated so old exact canaries cannot fall out of a global row cap', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const candidateIds = rows\.map\(row => row\.candidateId\)/)
  assert.match(route, /\.in\('candidate_id', candidateIds\)/)
  assert.match(route, /\.range\(from, to\)/)
  assert.match(route, /ROLLING_EVENT_PAGE_SIZE = 1000/)
  assert.match(route, /MASS_EVALUATION_ROLLING_AUTHORIZATION_REF/)
  assert.match(route, /authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF/)
  assert.match(route, /profile: 'cos_mass_distilled_independent_evaluation_runtime_v1'/)
  assert.doesNotMatch(route, /\.limit\(2000\)/)
})


test('a repair reopen marker preserves old verdict evidence but permits one new judge generation', () => {
  const oldVerdict = ev(artifactA.candidateId, 'independent_scorer', {
    claim: 'independent_evaluation',
    artifactHash: hashA,
  }, '2026-09-16T15:00:00Z')
  const oldCompleted = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_completed',
    artifactHash: hashA,
  }, '2026-09-16T15:01:00Z')
  const reopened = ev(artifactA.candidateId, 'host_controller', {
    claim: MASS_EVALUATION_REOPEN_CLAIM,
    artifactHash: hashA,
    repairRef: MASS_EVALUATION_JUDGE_ABSOLUTE_REPAIR_REF,
  }, '2026-09-16T16:00:00Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), oldVerdict, oldCompleted, reopened],
    now,
  })
  assert.equal(decision.issue, true)
})

test('zero-collapse judge failures are evaluator infrastructure, not model-quality attempts', () => {
  const approval = ev(artifactA.candidateId, 'host_controller', {
    claim: 'distilled_independent_evaluation_approved',
    authorizationRef: MASS_EVALUATION_ROLLING_AUTHORIZATION_REF,
    artifactHash: hashA,
  }, '2026-09-16T12:00:00Z', '2026-09-16T14:00:00Z')
  const started = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_started',
    artifactHash: hashA,
  }, '2026-09-16T12:00:10Z', '2026-09-16T12:12:10Z')
  const failed = ev(artifactA.candidateId, 'host_controller', {
    claim: 'mass_distilled_independent_evaluation_failed',
    artifactHash: hashA,
    error: 'mass_distilled_evaluation_judge_zero_collapse:retention',
  }, '2026-09-16T12:00:20Z')
  const decision = decideRollingMassEvaluationApproval({
    enabled: true,
    artifacts: [artifactA],
    events: [canary(artifactA), approval, started, failed],
    now,
  })
  assert.equal(decision.issue, true)
  if (decision.issue) assert.equal(decision.evidence.priorFailedAttempts, 0)
})


test('mass evaluator evidence reads have a candidate-first fine_tune index', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260920050000_mass_evaluation_candidate_evidence_index.sql', import.meta.url), 'utf8')
  assert.match(migration, /candidate_id, verifier, observed_at desc/i)
  assert.match(migration, /where event_type = 'fine_tune'/i)
  assert.match(route, /\.in\('candidate_id', candidateIds\)/)
  assert.match(route, /\.gte\('observed_at', new Date\(Date\.now\(\) - 30 \* 86_400_000\)\.toISOString\(\)\)/)
})


test('frontier proof claim priority is enforced atomically before returning to oldest-first', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260920225500_frontier_evaluation_proof_completions.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /v_frontier_completions integer := 0/)
  assert.match(migration, /cos_university_distilled_evaluation_runs/)
  assert.match(migration, /count\(distinct r\.candidate_id\)/)
  assert.match(migration, /cos_university_frontier_gkd_v1/)
  assert.match(migration, /v_frontier_completions < 4/)
  assert.match(
    migration,
    /case[\s\S]*v_frontier_completions < 4[\s\S]*cos_university_frontier_gkd_v1[\s\S]*then 0 else 1[\s\S]*a\.created_at asc/i,
  )
  assert.match(migration, /v_active_reservations >= 4/)
  assert.match(migration, /a\.created_at <= v_now - interval '12 hours'/)
  assert.match(migration, /v_max_endpoint<>18/)
  assert.match(migration, /v_max_judge<>4/)
  assert.match(migration, /v_max_wake<>1/)
  assert.match(migration, /v_max_cost>0\.200000/)
})
