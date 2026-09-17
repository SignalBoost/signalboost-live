// saas/tests/cosUniversityMassCanaryRollingAuthority.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_CANARY_APPROVAL_CLAIM,
  MASS_CANARY_PROFILE,
  MASS_CANARY_ROLLING_AUTHORIZATION_REF,
  MASS_CANARY_ROLLING_MAX_APPROVALS,
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

test('passed canary keeps its endpoint until independent evaluation completes', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const passed = event(a, 'local_distilled_runtime_canary_passed', '2026-09-17T16:00:00.000Z')
  const started = event(a, 'mass_distilled_independent_evaluation_started', '2026-09-17T16:10:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1' })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,started], now, enabled:true }), { issue:false, reason:'mass_canary_waiting_for_independent_evaluation' })
  const infraFailure = event(a, 'mass_distilled_independent_evaluation_failed', '2026-09-17T16:20:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1', error:'mass_distilled_evaluation_runtime_not_ready:network' })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,started,infraFailure], now, enabled:true }), { issue:false, reason:'mass_canary_waiting_for_independent_evaluation' })
  const completed = event(a, 'mass_distilled_independent_evaluation_completed', '2026-09-17T16:30:00.000Z', {}, { profile:'cos_mass_distilled_independent_evaluation_runtime_v1' })
  assert.equal((decideMassCanaryRollingApproval({ artifacts:[a,b], events:[passed,started,infraFailure,completed], now, enabled:true }) as any).artifact.candidateId, 'mass:2')
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
