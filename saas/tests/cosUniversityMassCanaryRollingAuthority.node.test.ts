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
  assert.deepEqual(decision.evidence, {
    profile: MASS_CANARY_PROFILE, claim: MASS_CANARY_APPROVAL_CLAIM, candidateId: 'mass:1', artifactHash: h(1),
    canaryAuthorized: true, maxCanaryInvocations: 1, maxEstimatedCanaryCostUsd: 0.2,
    productionTrafficAuthorized: false, automaticPromotionAuthorized: false, authorityExpanded: false,
    authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF,
  })
  assert.equal(decision.expiresAt, '2026-09-17T19:00:00.000Z')
})

test('a passed canary, an owner suspension, or three failed rolling attempts skip that artifact', () => {
  const passed = artifact(1, '2026-09-15T00:00:00.000Z'); const suspended = artifact(2, '2026-09-15T01:00:00.000Z')
  const failing = artifact(3, '2026-09-15T02:00:00.000Z'); const next = artifact(4, '2026-09-15T03:00:00.000Z')
  const events = [
    event(passed, 'local_distilled_runtime_canary_passed', '2026-09-16T00:00:00.000Z'),
    event(suspended, 'local_distilled_runtime_canary_suspended', '2026-09-16T00:00:00.000Z'),
    event(failing, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T10:00:00.000Z', { expiresAt: '2026-09-17T12:00:00.000Z' }, { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF }),
    ...[11, 12, 13].map(hour => event(failing, 'local_distilled_runtime_canary_failed', `2026-09-17T${hour}:00:00.000Z`)),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts: [passed, suspended, failing, next], events, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:4')
})

test('an armed approval anywhere blocks a second one; a consumed or expired one does not', () => {
  const a = artifact(1, '2026-09-15T00:00:00.000Z'); const b = artifact(2, '2026-09-15T01:00:00.000Z')
  const armed = event(a, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T16:50:00.000Z', { expiresAt: '2026-09-17T18:50:00.000Z' })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts: [a, b], events: [armed], now, enabled: true }), { issue: false, reason: 'mass_canary_approval_already_armed' })
  const consumed = [armed, event(a, 'local_distilled_runtime_canary_invocation_started', '2026-09-17T16:55:00.000Z')]
  assert.equal((decideMassCanaryRollingApproval({ artifacts: [a, b], events: consumed, now, enabled: true }) as any).artifact.candidateId, 'mass:1')
  const expired = event(a, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T10:00:00.000Z', { expiresAt: '2026-09-17T12:00:00.000Z' })
  assert.equal((decideMassCanaryRollingApproval({ artifacts: [a, b], events: [expired], now, enabled: true }) as any).artifact.candidateId, 'mass:1')
})

test('the kill switch and the 24-hour cap stop issuance', () => {
  const a = artifact(1)
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts: [a], events: [], now, enabled: false }), { issue: false, reason: 'mass_canary_rolling_authorization_disabled' })
  const others = Array.from({ length: MASS_CANARY_ROLLING_MAX_APPROVALS }, (_, i) => {
    const o = artifact(100 + i)
    return event(o, MASS_CANARY_APPROVAL_CLAIM, '2026-09-17T08:00:00.000Z', { expiresAt: '2026-09-17T10:00:00.000Z' }, { authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF })
  })
  assert.deepEqual(decideMassCanaryRollingApproval({ artifacts: [a], events: others, now, enabled: true }), { issue: false, reason: 'mass_canary_rolling_window_exhausted' })
})

test('the cron issues at most one approval before the unchanged atomic claim, behind the balance guard', () => {
  const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
  const guardAt = route.indexOf("error:'runpod_balance_guard'")
  const issueAt = route.indexOf('await issueRollingCanaryApproval(')
  const claimAt = route.indexOf('const claim=await claimNext()')
  assert.ok(guardAt > 0 && issueAt > guardAt && claimAt > issueAt)
  assert.match(route, /process\.env\.COS_MASS_CANARY_ROLLING_AUTHORIZATION!=='false'/)
  assert.match(route, /db\.rpc\('claim_next_mass_distilled_runtime_canary'\)/)
  assert.doesNotMatch(route, /productionTrafficAuthorized:true|automaticPromotionAuthorized:true/)
})
