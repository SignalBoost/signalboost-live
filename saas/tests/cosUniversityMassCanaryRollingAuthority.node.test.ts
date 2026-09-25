// saas/tests/cosUniversityMassCanaryRollingAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_CANARY_APPROVAL_CLAIM,
  MASS_CANARY_PROFILE,
  MASS_CANARY_ROLLING_AUTHORIZATION_REF,
  MASS_CANARY_ROLLING_MAX_APPROVALS,
  MASS_CANARY_ROLLING_WINDOW_HOURS,
  MASS_CANARY_MAX_CONCURRENT,
  MASS_CANARY_COLD_START_FAILURE,
  MASS_CANARY_NO_WORKER_FAILURE,
  MASS_CANARY_COLD_START_RETRY_COOLDOWN_MS,
  MASS_CANARY_COLD_START_RESUME_COOLDOWN_MS,
  MASS_CANARY_MAX_COLD_START_RESUMES_PER_RUNTIME,
  MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER,
  MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE,
  MASS_CANARY_BUILDER_V2_OPTIMIZER,
  MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE,
  MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS,
  MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS,
  MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE,
  MASS_CANARY_ENDPOINT_REFRESH_FAILURES,
  MASS_CANARY_IN_FLIGHT_TTL_MS,
  MASS_CANARY_MAX_IDENTICAL_FAILURES,
  MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_ROLLING_WINDOW,
  decideMassCanaryRollingApproval,
  type CanaryArtifact,
  type CanaryEvent,
} from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'

const now = new Date('2026-09-17T17:00:00.000Z')
const h = (n: number) => n.toString(16).padStart(64, '0')
const artifact = (n: number, createdAt = `2026-09-1${n % 7}T00:00:00.000Z`): CanaryArtifact =>
  ({ candidateId: `mass:${n}`, subjectId: 'computer_science', artifactHash: h(n), createdAt })
const v2BuilderArtifact = (candidateId: string, hashId: number, createdAt: string): CanaryArtifact => ({
  candidateId,
  subjectId: 'Computer Science & Coding',
  artifactHash: h(hashId),
  createdAt,
  trainingOptimizer: MASS_CANARY_BUILDER_V2_OPTIMIZER,
  frontierResponseAnchorRequired: true,
  frontierResponseAnchorEpochs: 1,
  frontierResponseAnchorItems: 16,
})
const replayArtifact = (candidateId: string, hashId: number, createdAt: string): CanaryArtifact => ({
  candidateId,
  subjectId: 'Law, Regulation & Governance',
  artifactHash: h(hashId),
  createdAt,
  failureDerivedReplayRequired: true,
  failureDerivedReplayItems: MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS,
  failureDerivedReplayEpochs: MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS,
  failureDerivedReplayLearningRate: MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE,
})
const event = (a: CanaryArtifact, claim: string, observedAt: string, extra: Partial<CanaryEvent> = {}, evidence: Record<string, unknown> = {}): CanaryEvent =>
  ({ candidateId: a.candidateId, observedAt, expiresAt: null, verifier: 'host_controller', evidence: { profile: MASS_CANARY_PROFILE, claim, artifactHash: a.artifactHash, ...evidence }, ...extra })

test('issues exactly the claim-compatible approval for the oldest artifact without a canary', () => {
  const older = artifact(1, '2026-09-15T00:00:00.000Z'); const newer = artifact(2, '2026-09-16T00:00:00.000Z')
  const decision = decideMassCanaryRollingApproval({ artifacts: [newer, older], events: [], now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:1')
  assert.equal(decision.expiresAt, '2026-09-17T19:00:00.000Z')
})

test('bounded Builder apprenticeship proof lane counts only confirmed response-anchor v2 Computer Science canaries', () => {
  assert.equal(MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE, 2)
  assert.equal(MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER, '2026-09-21T01:55:00.000Z')
  assert.equal(MASS_CANARY_BUILDER_V2_OPTIMIZER, 'frontier_response_anchor_then_stable_on_policy_distillation')
  const proofNow = new Date('2026-09-21T18:30:00.000Z')
  const legacy: CanaryArtifact = { candidateId:'mass:legacy', subjectId:'Mathematics', artifactHash:h(90), createdAt:'2026-09-20T00:00:00.000Z' }
  const oldRecipeFirst: CanaryArtifact = { candidateId:'mass:old-builder-1', subjectId:'Computer Science & Coding', artifactHash:h(91), createdAt:'2026-09-21T02:14:25.056Z' }
  const oldRecipeSecond: CanaryArtifact = { candidateId:'mass:old-builder-2', subjectId:'Computer Science & Coding', artifactHash:h(92), createdAt:'2026-09-21T02:31:24.295Z' }
  const first = v2BuilderArtifact('mass:v2-builder-1', 93, '2026-09-21T17:20:26.126Z')
  const second = v2BuilderArtifact('mass:v2-builder-2', 94, '2026-09-21T17:40:26.126Z')
  const oldRecipePasses = [
    event(oldRecipeFirst, 'local_distilled_runtime_canary_passed', '2026-09-21T14:57:06.858Z'),
    event(oldRecipeSecond, 'local_distilled_runtime_canary_passed', '2026-09-21T15:00:56.087Z'),
  ]

  const firstDecision = decideMassCanaryRollingApproval({
    artifacts:[legacy,oldRecipeFirst,oldRecipeSecond,second,first],
    events:oldRecipePasses,
    now:proofNow,
    enabled:true,
  })
  assert.ok('artifact' in firstDecision)
  assert.equal(firstDecision.artifact.candidateId, first.candidateId)

  const firstPassed = event(first, 'local_distilled_runtime_canary_passed', '2026-09-21T18:10:00.000Z')
  const secondDecision = decideMassCanaryRollingApproval({
    artifacts:[legacy,oldRecipeFirst,oldRecipeSecond,second,first],
    events:[...oldRecipePasses,firstPassed],
    now:proofNow,
    enabled:true,
  })
  assert.ok('artifact' in secondDecision)
  assert.equal(secondDecision.artifact.candidateId, second.candidateId)

  const secondPassed = event(second, 'local_distilled_runtime_canary_passed', '2026-09-21T18:20:00.000Z')
  const restored = decideMassCanaryRollingApproval({
    artifacts:[legacy,oldRecipeFirst,oldRecipeSecond,second,first],
    events:[...oldRecipePasses,firstPassed,secondPassed],
    now:proofNow,
    enabled:true,
  })
  assert.ok('artifact' in restored)
  assert.equal(restored.artifact.candidateId, legacy.candidateId)
})

test('old weak replay receipts cannot satisfy the upgraded remediation proof cohort', () => {
  assert.equal(MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS, 20)
  assert.equal(MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS, 3)
  assert.equal(MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE, 5e-5)
  const legacy = artifact(79, '2026-09-20T00:00:00.000Z')
  const weakReplay: CanaryArtifact = {
    candidateId:'mass:weak-replay',
    subjectId:'Law, Regulation & Governance',
    artifactHash:h(78),
    createdAt:'2026-09-22T17:00:00.000Z',
    failureDerivedReplayRequired:true,
    failureDerivedReplayItems:5,
    failureDerivedReplayEpochs:1,
    failureDerivedReplayLearningRate:2e-5,
  }
  const strongReplay = replayArtifact('mass:strong-replay', 77, '2026-09-22T18:00:00.000Z')
  const decision = decideMassCanaryRollingApproval({
    artifacts:[legacy,weakReplay,strongReplay],
    events:[event(weakReplay,'local_distilled_runtime_canary_passed','2026-09-22T17:30:00.000Z')],
    now:new Date('2026-09-22T20:00:00.000Z'),
    enabled:true,
    builderProofPasses:MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE,
  })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId,strongReplay.candidateId)
  assert.equal(decision.evidence.remediationReplayProofPriority,true)
})

test('first two post-GKD remediation replay artifacts get bounded canary proof priority after Builder proof is complete', () => {
  assert.equal(MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE, 2)
  const proofNow = new Date('2026-09-22T20:00:00.000Z')
  const legacy = artifact(80, '2026-09-20T00:00:00.000Z')
  const builderOne = v2BuilderArtifact('mass:builder-done-1', 81, '2026-09-21T17:00:00.000Z')
  const builderTwo = v2BuilderArtifact('mass:builder-done-2', 82, '2026-09-21T17:10:00.000Z')
  const replayOne = replayArtifact('mass:replay-1', 83, '2026-09-22T18:07:59.000Z')
  const replayTwo = replayArtifact('mass:replay-2', 84, '2026-09-22T18:20:00.000Z')
  const builderDone = [
    event(builderOne, 'local_distilled_runtime_canary_passed', '2026-09-21T18:00:00.000Z'),
    event(builderTwo, 'local_distilled_runtime_canary_passed', '2026-09-21T18:10:00.000Z'),
  ]

  const first = decideMassCanaryRollingApproval({
    artifacts:[legacy,builderOne,builderTwo,replayTwo,replayOne], events:builderDone, now:proofNow, enabled:true,
  })
  assert.ok('artifact' in first)
  assert.equal(first.artifact.candidateId, replayOne.candidateId)
  assert.equal(first.evidence.remediationReplayProofPriority, true)

  const firstPassed = event(replayOne, 'local_distilled_runtime_canary_passed', '2026-09-22T18:30:00.000Z')
  const second = decideMassCanaryRollingApproval({
    artifacts:[legacy,builderOne,builderTwo,replayTwo,replayOne], events:[...builderDone,firstPassed], now:proofNow, enabled:true,
  })
  assert.ok('artifact' in second)
  assert.equal(second.artifact.candidateId, replayTwo.candidateId)

  const secondPassed = event(replayTwo, 'local_distilled_runtime_canary_passed', '2026-09-22T18:40:00.000Z')
  const restored = decideMassCanaryRollingApproval({
    artifacts:[legacy,builderOne,builderTwo,replayTwo,replayOne],
    events:[...builderDone,firstPassed,secondPassed], now:proofNow, enabled:true,
  })
  assert.ok('artifact' in restored)
  assert.equal(restored.artifact.candidateId, legacy.candidateId)
})

test('replay proof lane proves a replay-trained Computer Science artifact before non-CS replay peers', () => {
  const proofNow = new Date('2026-09-22T20:00:00.000Z')
  const legacy = artifact(87, '2026-09-20T00:00:00.000Z')
  const olderLaw = replayArtifact('mass:replay-law', 88, '2026-09-22T18:07:59.000Z')
  const newerComputerScience: CanaryArtifact = {
    ...replayArtifact('mass:replay-cs', 89, '2026-09-22T18:19:57.000Z'),
    subjectId:'Computer Science & Coding',
  }

  const first = decideMassCanaryRollingApproval({
    artifacts:[legacy,olderLaw,newerComputerScience],
    events:[],
    now:proofNow,
    enabled:true,
    builderProofPasses:MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE,
    remediationReplayProofPasses:0,
  })
  assert.ok('artifact' in first)
  assert.equal(first.artifact.candidateId,newerComputerScience.candidateId)

  const csPassed = event(newerComputerScience,'local_distilled_runtime_canary_passed','2026-09-22T18:40:00.000Z')
  const second = decideMassCanaryRollingApproval({
    artifacts:[legacy,olderLaw,newerComputerScience],
    events:[csPassed],
    now:proofNow,
    enabled:true,
    builderProofPasses:MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE,
    remediationReplayProofPasses:1,
  })
  assert.ok('artifact' in second)
  assert.equal(second.artifact.candidateId,olderLaw.candidateId)
})

test('durable proof counts survive proof artifacts leaving the pending canary queue', () => {
  const proofNow = new Date('2026-09-22T20:00:00.000Z')
  const legacy = artifact(85, '2026-09-20T00:00:00.000Z')
  const replay = replayArtifact('mass:replay-durable', 86, '2026-09-22T18:07:59.000Z')

  const replayNeeded = decideMassCanaryRollingApproval({
    artifacts:[legacy,replay],
    events:[],
    now:proofNow,
    enabled:true,
    builderProofPasses:MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE,
    remediationReplayProofPasses:0,
  })
  assert.ok('artifact' in replayNeeded)
  assert.equal(replayNeeded.artifact.candidateId,replay.candidateId)

  const cohortsDone = decideMassCanaryRollingApproval({
    artifacts:[legacy,replay],
    events:[],
    now:proofNow,
    enabled:true,
    builderProofPasses:MASS_CANARY_BUILDER_APPRENTICESHIP_PROOF_SAMPLE,
    remediationReplayProofPasses:MASS_CANARY_REMEDIATION_REPLAY_PROOF_SAMPLE,
  })
  assert.ok('artifact' in cohortsDone)
  assert.equal(cohortsDone.artifact.candidateId,legacy.candidateId)
})

test('passed canary keeps its endpoint through one transient independent-evaluation lifecycle failure', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const passed = event(a, 'local_distilled_runtime_canary_passed', '2026-09-17T16:00:00.000Z')
  const started = event(a, 'mass_distilled_independent_evaluation_started', '2026-09-17T16:10:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1' })
  // Artifact 1 is awaiting evaluation, which is artifact-local: the queue advances to artifact 2
  // rather than stopping. The single-canary rule is held by the armed-approval semaphore instead.
  assert.equal((decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,started], now, enabled:true }) as any).artifact.candidateId, 'mass:2')
  const infraFailure = event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T16:20:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_runtime_not_ready:network' })
  assert.equal((decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,started,infraFailure], now, enabled:true }) as any).artifact.candidateId, 'mass:2')
  const completed = event(a, 'mass_distilled_independent_evaluation_completed', '2026-09-17T16:30:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1' })
  assert.equal((decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,started,infraFailure,completed], now, enabled:true }) as any).artifact.candidateId, 'mass:2')
})

test('two consecutive endpoint-lifecycle failures refresh the same artifact canary before advancing the queue', () => {
  assert.equal(MASS_CANARY_ENDPOINT_REFRESH_FAILURES, 2)
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const events = [
    event(a, 'local_distilled_runtime_canary_passed', '2026-09-17T16:00:00.000Z'),
    event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T16:10:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_runtime_not_ready:network' }),
    event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T16:20:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_runtime_not_ready:503' }),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts:[a,b], events, now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:1')
  assert.equal(decision.evidence.endpointRefresh, true)
  assert.equal(decision.evidence.endpointRefreshReason, 'repeated_evaluation_endpoint_lifecycle_failure')
})

test('a later non-lifecycle failure resets endpoint-refresh counting', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const events = [
    event(a, 'local_distilled_runtime_canary_passed', '2026-09-17T15:00:00.000Z'),
    event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T15:10:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_runtime_not_ready:network' }),
    event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T15:20:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_runtime_not_ready:network' }),
    event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T15:30:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_answer_missing:abc:finish=stop' }),
  ]
  // Endpoint-refresh counting is unchanged for artifact 1, but a pending handoff no longer freezes
  // the queue: artifact 2 is approved while artifact 1 waits on the evaluator.
  assert.equal((decideMassCanaryRollingApproval({ artifacts:[a,b], events, now, enabled:true }) as any).artifact.candidateId, 'mass:2')
})

test('three substantive evaluation failures release the endpoint handoff', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const events = [event(a,'local_distilled_runtime_canary_passed','2026-09-17T15:00:00.000Z'), ...[1,2,3].map(n=>event(a,'mass_distilled_independent_evaluation_failed',`2026-09-17T15:${n}0:00.000Z`,{}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'substantive_failure' }))]
  assert.equal((decideMassCanaryRollingApproval({ artifacts:[a,b], events, now, enabled:true }) as any).artifact.candidateId, 'mass:2')
})

test('one armed approval leaves the second bounded slot available', () => {
  assert.equal(MASS_CANARY_MAX_CONCURRENT,2)
  const a=artifact(1); const b=artifact(2); const d=artifact(3)
  const armedA=event(a,MASS_CANARY_APPROVAL_CLAIM,'2026-09-17T16:50:00.000Z',{expiresAt:'2026-09-17T18:50:00.000Z'})
  const second=decideMassCanaryRollingApproval({artifacts:[a,b,d],events:[armedA],now,enabled:true})
  assert.ok('artifact' in second)
  assert.equal(second.artifact.candidateId,b.candidateId)
  const armedB=event(b,MASS_CANARY_APPROVAL_CLAIM,'2026-09-17T16:51:00.000Z',{expiresAt:'2026-09-17T18:51:00.000Z'})
  assert.deepEqual(decideMassCanaryRollingApproval({artifacts:[a,b,d],events:[armedA,armedB],now,enabled:true}),{issue:false,reason:'mass_canary_concurrency_exhausted'})
})

test('one paid canary invocation leaves the second slot available until concurrency is exhausted', () => {
  assert.equal(MASS_CANARY_MAX_CONCURRENT,2)
  const a=artifact(1); const b=artifact(2); const d=artifact(3)
  const startedA=event(a,'local_distilled_runtime_canary_invocation_started','2026-09-17T16:55:00.000Z')
  const second=decideMassCanaryRollingApproval({artifacts:[a,b,d],events:[startedA],now,enabled:true})
  assert.ok('artifact' in second)
  assert.equal(second.artifact.candidateId,b.candidateId)

  const startedB=event(b,'local_distilled_runtime_canary_invocation_started','2026-09-17T16:56:00.000Z')
  assert.deepEqual(
    decideMassCanaryRollingApproval({artifacts:[a,b,d],events:[startedA,startedB],now,enabled:true}),
    {issue:false,reason:'mass_canary_concurrency_exhausted'},
  )

  const passedA=event(a,'local_distilled_runtime_canary_passed','2026-09-17T16:57:00.000Z')
  const afterPass=decideMassCanaryRollingApproval({artifacts:[a,b,d],events:[startedA,startedB,passedA],now,enabled:true})
  assert.ok('artifact' in afterPass)
  assert.equal(afterPass.artifact.candidateId,d.candidateId)
})

test('an orphaned invocation marker releases after the bounded in-flight TTL', () => {
  assert.equal(MASS_CANARY_IN_FLIGHT_TTL_MS, 10 * 60 * 1000)
  const a=artifact(1); const b=artifact(2)
  const staleStart=event(a,'local_distilled_runtime_canary_invocation_started',
    new Date(now.getTime()-MASS_CANARY_IN_FLIGHT_TTL_MS-1000).toISOString())
  const decision=decideMassCanaryRollingApproval({artifacts:[a,b],events:[staleStart],now,enabled:true})
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId,a.candidateId)
})

test('one infrastructure-failing artifact cannot consume more than two slots in the same rolling hour', () => {
  assert.equal(MASS_CANARY_MAX_INVOCATIONS_PER_ARTIFACT_PER_ROLLING_WINDOW, 2)
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const events = [
    event(a, 'local_distilled_runtime_canary_invocation_started', '2026-09-17T16:10:00.000Z'),
    event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T16:20:00.000Z', {}, { error:MASS_CANARY_COLD_START_FAILURE }),
    event(a, 'local_distilled_runtime_canary_invocation_started', '2026-09-17T16:30:00.000Z'),
    event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T16:40:00.000Z', {}, { error:MASS_CANARY_NO_WORKER_FAILURE }),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts:[a,b], events, now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, b.candidateId)
})

test('the kill switch and the hourly paid-invocation cap stop issuance', () => {
  const a=artifact(1)
  assert.equal(MASS_CANARY_ROLLING_WINDOW_HOURS, 1)
  assert.deepEqual(decideMassCanaryRollingApproval({artifacts:[a],events:[],now,enabled:false}),{issue:false,reason:'mass_canary_rolling_authorization_disabled'})
  const starts=Array.from({length:MASS_CANARY_ROLLING_MAX_APPROVALS},(_,i)=>{
    const o=artifact(100+i)
    return event(o,'local_distilled_runtime_canary_invocation_started','2026-09-17T16:30:00.000Z')
  })
  assert.deepEqual(decideMassCanaryRollingApproval({artifacts:[a],events:starts,now,enabled:true}),{issue:false,reason:'mass_canary_rolling_window_exhausted'})
})

test('cron reads evaluation events before issuing a new canary and preserves authority fences', () => {
  const route=readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts',import.meta.url),'utf8')
  assert.match(route,/Include both canary and independent-evaluation events/)
  assert.doesNotMatch(route,/\.contains\('evidence',\{profile:MASS_CANARY_PROFILE\}\)/)
  assert.match(route,/db\.rpc\('claim_next_mass_distilled_runtime_canary'\)/)
  assert.match(route,/created_at,intended_use/)
  assert.match(route,/oldestArtifacts,v2BuilderArtifacts,replayArtifacts/)
  assert.match(route,/\.limit\(200\)/)
  assert.match(route,/\.eq\('subject_id','Computer Science & Coding'\)/)
  assert.match(route,/\.gte\('created_at',MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER\)/)
  assert.match(route,/\.contains\('intended_use',\{trainingReceipt:\{/)
  assert.match(route,/optimizer:MASS_CANARY_BUILDER_V2_OPTIMIZER/)
  assert.match(route,/artifactByCandidate=new Map/)
  assert.match(route,/frontierResponseAnchorRequired:receipt\.frontierResponseAnchorRequired===true/)
  assert.match(route,/frontierResponseAnchorEpochs:Number\(receipt\.frontierResponseAnchorEpochs\|\|0\)/)
  assert.match(route,/frontierResponseAnchorItems:Number\(receipt\.frontierResponseAnchorItems\|\|0\)/)
  assert.match(route,/failureDerivedReplayRequired:receipt\.failureDerivedReplayRequired===true/)
  assert.match(route,/failureDerivedReplayItems:Number\(receipt\.failureDerivedReplayItems\|\|0\)/)
  assert.match(route,/MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS/)
  assert.match(route,/failureDerivedReplayEpochs:Number\(receipt\.failureDerivedReplayEpochs\|\|0\)/)
  assert.match(route,/failureDerivedReplayLearningRate:Number\(receipt\.failureDerivedReplayLearningRate\|\|0\)/)
  assert.match(route,/contains\('intended_use',\{trainingReceipt:\{failureDerivedReplayRequired:true\}\}\)/)
  assert.match(route,/builderProofPasses=\[\.\.\.passedCandidates\]/)
  assert.match(route,/remediationReplayProofPasses=\[\.\.\.passedCandidates\]/)
  assert.match(route,/builderProofPasses,/)
  assert.match(route,/remediationReplayProofPasses,/)
  assert.doesNotMatch(route,/productionTrafficAuthorized:true|automaticPromotionAuthorized:true/)
})

test('cold-start timeouts do not spend an artifact\'s three substantive attempts', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const events = [
    event(a, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T15:00:00.000Z', { expiresAt: '2026-09-17T15:30:00.000Z' }, { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF }),
    ...['15:05', '15:10', '15:15'].map(time => event(a, 'local_distilled_runtime_canary_failed', `2026-09-17T${time}:00.000Z`, {}, { error: MASS_CANARY_COLD_START_FAILURE })),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts: [a], events, now, enabled: true })
  assert.ok('artifact' in decision, `expected a retry, got ${JSON.stringify(decision)}`)
})

test('one exact cold-start timeout may resume the same endpoint/runtime after the short continuation cooldown', () => {
  assert.equal(MASS_CANARY_COLD_START_RESUME_COOLDOWN_MS, 60_000)
  assert.equal(MASS_CANARY_MAX_COLD_START_RESUMES_PER_RUNTIME, 1)
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const failedAt = new Date(now.getTime() - 2 * 60_000).toISOString()
  const cold = event(a, 'local_distilled_runtime_canary_failed', failedAt, {}, {
    error: MASS_CANARY_COLD_START_FAILURE,
    endpointId: 'oqoteq4035elnb',
    runtimeKey: '40461bb31f',
  })
  const decision = decideMassCanaryRollingApproval({ artifacts:[a], events:[cold], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.evidence.coldStartResume, true)
  assert.equal(decision.evidence.coldStartResumeEndpointId, 'oqoteq4035elnb')
  assert.equal(decision.evidence.coldStartResumeRuntimeKey, '40461bb31f')
})

test('a second cold-start timeout on the same runtime falls back to the long fairness cooldown', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const first = event(a, 'local_distilled_runtime_canary_failed', new Date(now.getTime() - 8 * 60_000).toISOString(), {}, {
    error: MASS_CANARY_COLD_START_FAILURE,
    endpointId: 'oqoteq4035elnb',
    runtimeKey: '40461bb31f',
  })
  const second = event(a, 'local_distilled_runtime_canary_failed', new Date(now.getTime() - 2 * 60_000).toISOString(), {}, {
    error: MASS_CANARY_COLD_START_FAILURE,
    endpointId: 'oqoteq4035elnb',
    runtimeKey: '40461bb31f',
  })
  const decision = decideMassCanaryRollingApproval({ artifacts:[a,b], events:[first,second], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, b.candidateId)
})

test('RunPod 502/503/504 are infrastructure failures and do not spend substantive attempts', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const events = [
    event(a, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T14:00:00.000Z', { expiresAt: '2026-09-17T14:30:00.000Z' }, { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF }),
    event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T14:10:00.000Z', {}, { error:'HTTP 502' }),
    event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T14:20:00.000Z', {}, { error:'HTTP 503' }),
    event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T14:30:00.000Z', {}, { error:'HTTP 504' }),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts:[a], events, now, enabled:true })
  assert.ok('artifact' in decision, `gateway infrastructure failures must remain retryable: ${JSON.stringify(decision)}`)
})

test('one RunPod 502 with a live worker may resume the same exact runtime after the short cooldown', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const failedAt = new Date(now.getTime() - 2 * 60_000).toISOString()
  const failure = event(a, 'local_distilled_runtime_canary_failed', failedAt, {}, {
    error:'HTTP 502',
    endpointId:'wy0sldg4am4tts',
    runtimeKey:'9a492f8f63',
    healthAfter:{workers:{idle:0,ready:0,running:1,initializing:0}},
  })
  const decision = decideMassCanaryRollingApproval({ artifacts:[a], events:[failure], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.evidence.coldStartResume, true)
  assert.equal(decision.evidence.coldStartResumeEndpointId, 'wy0sldg4am4tts')
  assert.equal(decision.evidence.coldStartResumeRuntimeKey, '9a492f8f63')
})

test('the Production timeout then 502 sequence stays bounded to one same-runtime continuation', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const first = event(a, 'local_distilled_runtime_canary_failed', new Date(now.getTime() - 8 * 60_000).toISOString(), {}, {
    error:MASS_CANARY_COLD_START_FAILURE,
    endpointId:'wy0sldg4am4tts',
    runtimeKey:'9a492f8f63',
    healthAfter:{workers:{idle:0,ready:0,running:1,initializing:0}},
  })
  const second = event(a, 'local_distilled_runtime_canary_failed', new Date(now.getTime() - 2 * 60_000).toISOString(), {}, {
    error:'HTTP 502',
    endpointId:'wy0sldg4am4tts',
    runtimeKey:'9a492f8f63',
    healthAfter:{workers:{idle:0,ready:0,running:1,initializing:0}},
  })
  const decision = decideMassCanaryRollingApproval({ artifacts:[a,b], events:[first,second], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, b.candidateId)
})

test('a gateway failure with no live worker is infrastructure but does not pin a dead endpoint', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const recent = event(a, 'local_distilled_runtime_canary_failed', new Date(now.getTime() - 2 * 60_000).toISOString(), {}, {
    error:'HTTP 503',
    endpointId:'deadendpoint1',
    runtimeKey:'40461bb31f',
    healthAfter:{workers:{idle:0,ready:0,running:0,initializing:0}},
  })
  const decision = decideMassCanaryRollingApproval({ artifacts:[a,b], events:[recent], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, b.candidateId)
})

test('RunPod no-worker failures are infrastructure, yield the artifact, and never reuse the dead endpoint', () => {
  assert.equal(MASS_CANARY_NO_WORKER_FAILURE, 'mass_distilled_runtime_worker_not_ready')
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const recent = event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T16:55:00.000Z', {}, {
    error: MASS_CANARY_NO_WORKER_FAILURE,
    endpointId: 'deadendpoint1',
    runtimeKey: '40461bb31f',
  })
  const yielded = decideMassCanaryRollingApproval({ artifacts:[a,b], events:[recent], now, enabled:true })
  assert.ok('artifact' in yielded)
  assert.equal(yielded.artifact.candidateId, b.candidateId)

  const oldNoWorker = ['16:10','16:20','16:30','16:40'].map((time, index) =>
    event(a, 'local_distilled_runtime_canary_failed', `2026-09-17T${time}:00.000Z`, {}, {
      error: MASS_CANARY_NO_WORKER_FAILURE,
      endpointId: `deadendpoint${index}`,
      runtimeKey: `40461bb3${index}f`,
    }))
  const retry = decideMassCanaryRollingApproval({ artifacts:[a,b], events:oldNoWorker, now, enabled:true })
  assert.ok('artifact' in retry)
  assert.equal(retry.artifact.candidateId, a.candidateId)
  assert.equal(retry.evidence.coldStartResume, undefined)
  assert.equal(retry.evidence.coldStartResumeEndpointId, undefined)
  assert.equal(retry.evidence.coldStartResumeRuntimeKey, undefined)
})

test('cold-start failures yield briefly, then remain retryable instead of becoming a permanent identical-error stop', () => {
  assert.equal(MASS_CANARY_COLD_START_RETRY_COOLDOWN_MS, 10 * 60_000)
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const recent = event(a, 'local_distilled_runtime_canary_failed', '2026-09-17T16:55:00.000Z', {}, { error: MASS_CANARY_COLD_START_FAILURE })
  const yielded = decideMassCanaryRollingApproval({ artifacts:[a,b], events:[recent], now, enabled:true })
  assert.ok('artifact' in yielded)
  assert.equal(yielded.artifact.candidateId, b.candidateId)

  const oldColdStarts = ['16:10','16:20','16:30','16:40'].map(time =>
    event(a, 'local_distilled_runtime_canary_failed', `2026-09-17T${time}:00.000Z`, {}, { error: MASS_CANARY_COLD_START_FAILURE }))
  const retry = decideMassCanaryRollingApproval({ artifacts:[a,b], events:oldColdStarts, now, enabled:true })
  assert.ok('artifact' in retry)
  assert.equal(retry.artifact.candidateId, a.candidateId)
})

test('the same canary failure repeating stops that artifact instead of looping', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const stuck = Array.from({ length: MASS_CANARY_MAX_IDENTICAL_FAILURES }, (_, index) =>
    event(a, 'local_distilled_runtime_canary_failed', `2026-09-17T15:0${index}:00.000Z`, {}, { error: 'distilled_bootstrap_failed:adapter_incompatible' }))
  const decision = decideMassCanaryRollingApproval({ artifacts: [a, b], events: stuck, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:2', 'the stuck artifact is skipped and the queue moves on')
})

test('the hourly ceiling preserves the bounded 288-per-day nominal spend envelope without a long blackout', () => {
  assert.equal(MASS_CANARY_ROLLING_WINDOW_HOURS, 1)
  assert.equal(MASS_CANARY_ROLLING_MAX_APPROVALS, 12)
  assert.equal((24 / MASS_CANARY_ROLLING_WINDOW_HOURS) * MASS_CANARY_ROLLING_MAX_APPROVALS, 288)
  const a = artifact(1)
  const exhausted = Array.from({ length:MASS_CANARY_ROLLING_MAX_APPROVALS }, (_, index) => {
    const other = artifact(100 + index)
    return event(other, 'local_distilled_runtime_canary_invocation_started', '2026-09-17T16:30:00.000Z')
  })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts:[a], events:exhausted, now, enabled:true }),
    { issue:false, reason:'mass_canary_rolling_window_exhausted' })

  const agedOut = exhausted.map(item => ({ ...item, observedAt:'2026-09-17T15:00:00.000Z' }))
  const resumed = decideMassCanaryRollingApproval({ artifacts:[a], events:agedOut, now, enabled:true })
  assert.ok('artifact' in resumed, `expected admission after the hourly window aged out, got ${JSON.stringify(resumed)}`)
  assert.equal(resumed.artifact.candidateId, a.candidateId)
})

test('expired unused approvals do not consume spend capacity while a live armed approval still reserves one slot', () => {
  const a = artifact(1)
  const staleUnused = Array.from({ length:MASS_CANARY_ROLLING_MAX_APPROVALS }, (_, index) => {
    const other = artifact(200 + index)
    return event(other, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T13:00:00.000Z',
      { expiresAt:'2026-09-17T15:00:00.000Z' },
      { authorizationRef:MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized:true })
  })
  const reclaimed = decideMassCanaryRollingApproval({ artifacts:[a], events:staleUnused, now, enabled:true })
  assert.ok('artifact' in reclaimed, `expected expired zero-spend approvals to be reclaimed, got ${JSON.stringify(reclaimed)}`)

  const starts = Array.from({ length:MASS_CANARY_ROLLING_MAX_APPROVALS - 1 }, (_, index) => {
    const other = artifact(300 + index)
    return event(other, 'local_distilled_runtime_canary_invocation_started', '2026-09-17T16:30:00.000Z')
  })
  const armedArtifact = artifact(999)
  const armed = event(armedArtifact, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T16:50:00.000Z',
    { expiresAt:'2026-09-17T18:50:00.000Z' },
    { authorizationRef:MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized:true })
  assert.deepEqual(
    decideMassCanaryRollingApproval({ artifacts:[a,armedArtifact], events:[...starts,armed], now, enabled:true }),
    { issue:false, reason:'mass_canary_rolling_window_exhausted' },
  )
})

test('a canary-passed artifact awaiting evaluation never freezes the rest of the queue', () => {
  // Production 2026-09-19: six artifacts had passed their canary and were waiting on the evaluator,
  // and the queue-wide handoff check left 45 aged artifacts with zero canary attempts - not retry
  // exhaustion, never attempted at all. With no live approval the next eligible artifact must be
  // approved.
  // Distinct, strictly increasing timestamps so queue order is unambiguous.
  const artifacts = Array.from({ length: 46 }, (_, i) =>
    artifact(i + 1, `2026-09-15T00:${String(i).padStart(2, '0')}:00.000Z`))
  const first = artifacts[0]
  const events = [
    event(first, 'local_distilled_runtime_canary_passed', '2026-09-17T16:00:00.000Z'),
    event(first, 'mass_distilled_independent_evaluation_started', '2026-09-17T16:10:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1' }),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts, events, now, enabled:true })
  assert.ok('artifact' in decision, `expected an approval, got ${JSON.stringify(decision)}`)
  assert.notEqual(decision.artifact.candidateId, first.candidateId)
  assert.equal(decision.artifact.candidateId, artifacts[1].candidateId)
})

test('the bounded semaphore permits one additional approval but no third active slot', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const d = artifact(3, '2026-09-15T02:00:00.000Z')
  const armedA = event(a, MASS_CANARY_APPROVAL_CLAIM, new Date(now.getTime() - 60_000).toISOString(),
    { expiresAt: new Date(now.getTime() + 3_600_000).toISOString() },
    { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized: true })
  const second=decideMassCanaryRollingApproval({ artifacts:[a,b,d], events:[armedA], now, enabled:true })
  assert.ok('artifact' in second)
  assert.equal(second.artifact.candidateId,b.candidateId)
  const armedB = event(b, MASS_CANARY_APPROVAL_CLAIM, new Date(now.getTime() - 30_000).toISOString(),
    { expiresAt: new Date(now.getTime() + 3_600_000).toISOString() },
    { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized: true })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts:[a,b,d], events:[armedA,armedB], now, enabled:true }),
    { issue:false, reason:'mass_canary_concurrency_exhausted' })
})


test('a duplicate approval issued after an exact-artifact canary pass is stale and cannot freeze the queue', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const passed = event(a, 'local_distilled_runtime_canary_passed', '2026-09-17T15:00:00.000Z')
  const duplicate = event(a, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T16:00:00.000Z',
    { expiresAt: '2026-09-17T18:00:00.000Z' },
    { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized: true })
  const decision = decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,duplicate], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, b.candidateId)
})

test('an explicit endpoint-refresh approval occupies one bounded slot without freezing another artifact', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z')
  const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const passed = event(a, 'local_distilled_runtime_canary_passed', '2026-09-17T15:00:00.000Z')
  const refresh = event(a, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T16:00:00.000Z',
    { expiresAt: '2026-09-17T18:00:00.000Z' },
    { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized: true, endpointRefresh: true })
  const decision=decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,refresh], now, enabled:true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId,b.candidateId)
})
