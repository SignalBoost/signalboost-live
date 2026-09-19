// saas/tests/cosUniversityMassCanaryRollingAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_CANARY_APPROVAL_CLAIM,
  MASS_CANARY_PROFILE,
  MASS_CANARY_ROLLING_AUTHORIZATION_REF,
  MASS_CANARY_ROLLING_MAX_APPROVALS,
  MASS_CANARY_COLD_START_FAILURE,
  MASS_CANARY_ENDPOINT_REFRESH_FAILURES,
  MASS_CANARY_MAX_IDENTICAL_FAILURES,
  decideMassCanaryRollingApproval,
  type CanaryArtifact,
  type CanaryEvent,
} from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'

const now = new Date('2026-09-17T17:00:00.000Z')
const h = (n: number) => n.toString(16).padStart(64, '0')
const artifact = (n: number, createdAt = `2026-09-1${n % 7}T00:00:00.000Z`): CanaryArtifact =>
  ({ candidateId: `mass:${n}`, subjectId: 'computer_science', artifactHash: h(n), createdAt })
const event = (a: CanaryArtifact, claim: string, observedAt: string, extra: Partial<CanaryEvent> = {}, evidence: Record<string, unknown> = {}): CanaryEvent =>
  ({ candidateId: a.candidateId, observedAt, expiresAt: null, verifier: 'host_controller', evidence: { profile: MASS_CANARY_PROFILE, claim, artifactHash: a.artifactHash, ...evidence }, ...extra })

test('issues exactly the claim-compatible approval for the oldest artifact without a canary', () => {
  const older = artifact(1, '2026-09-15T00:00:00.000Z'); const newer = artifact(2, '2026-09-16T00:00:00.000Z')
  const decision = decideMassCanaryRollingApproval({ artifacts: [newer, older], events: [], now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:1')
  assert.equal(decision.expiresAt, '2026-09-17T19:00:00.000Z')
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

test('an armed approval anywhere blocks a second one', () => {
  const a=artifact(1); const b=artifact(2)
  const armed=event(a,MASS_CANARY_APPROVAL_CLAIM,'2026-09-17T16:50:00.000Z',{expiresAt:'2026-09-17T18:50:00.000Z'})
  assert.deepEqual(decideMassCanaryRollingApproval({artifacts:[a,b],events:[armed],now,enabled:true}),{issue:false,reason:'mass_canary_approval_already_armed'})
})

test('the kill switch and the 24-hour cap stop issuance', () => {
  const a=artifact(1)
  assert.deepEqual(decideMassCanaryRollingApproval({artifacts:[a],events:[],now,enabled:false}),{issue:false,reason:'mass_canary_rolling_authorization_disabled'})
  const others=Array.from({length:MASS_CANARY_ROLLING_MAX_APPROVALS},(_,i)=>{const o=artifact(100+i);return event(o,MASS_CANARY_APPROVAL_CLAIM,'2026-09-17T08:00:00.000Z',{expiresAt:'2026-09-17T10:00:00.000Z'},{authorizationRef:MASS_CANARY_ROLLING_AUTHORIZATION_REF})})
  assert.deepEqual(decideMassCanaryRollingApproval({artifacts:[a],events:others,now,enabled:true}),{issue:false,reason:'mass_canary_rolling_window_exhausted'})
})

test('cron reads evaluation events before issuing a new canary and preserves authority fences', () => {
  const route=readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts',import.meta.url),'utf8')
  assert.match(route,/Include both canary and independent-evaluation events/)
  assert.doesNotMatch(route,/\.contains\('evidence',\{profile:MASS_CANARY_PROFILE\}\)/)
  assert.match(route,/db\.rpc\('claim_next_mass_distilled_runtime_canary'\)/)
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

test('the same canary failure repeating stops that artifact instead of looping', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const stuck = Array.from({ length: MASS_CANARY_MAX_IDENTICAL_FAILURES }, (_, index) =>
    event(a, 'local_distilled_runtime_canary_failed', `2026-09-17T15:0${index}:00.000Z`, {}, { error: 'distilled_bootstrap_failed:adapter_incompatible' }))
  const decision = decideMassCanaryRollingApproval({ artifacts: [a, b], events: stuck, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:2', 'the stuck artifact is skipped and the queue moves on')
})

test('the raised daily ceiling still bounds spend', () => {
  assert.equal(MASS_CANARY_ROLLING_MAX_APPROVALS, 72)
  const a = artifact(1)
  const exhausted = Array.from({ length: MASS_CANARY_ROLLING_MAX_APPROVALS }, (_, index) => {
    const other = artifact(100 + index)
    return event(other, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T08:00:00.000Z', { expiresAt: '2026-09-17T10:00:00.000Z' }, { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF })
  })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts: [a], events: exhausted, now, enabled: true }), { issue: false, reason: 'mass_canary_rolling_window_exhausted' })
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

test('the armed approval remains a queue-wide semaphore', () => {
  // One canary endpoint at a time: a live approval on ANY artifact still stops issuance everywhere,
  // even though an awaiting-evaluation artifact no longer does.
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const armed = event(a, MASS_CANARY_APPROVAL_CLAIM, new Date(now.getTime() - 60_000).toISOString(),
    { expiresAt: new Date(now.getTime() + 3_600_000).toISOString() },
    { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF, canaryAuthorized: true })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts:[a,b], events:[armed], now, enabled:true }),
    { issue:false, reason:'mass_canary_approval_already_armed' })
})
