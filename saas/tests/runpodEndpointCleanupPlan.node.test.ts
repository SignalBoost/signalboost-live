// saas/tests/runpodEndpointCleanupPlan.node.test.ts
//
// 2026-09-27: ~400 idle mass-distilled RunPod endpoints accumulated (nothing ever deleted one) and RunPod's
// endpoint listing began failing with HTTP 500, blocking every University exam. These tests pin that cleanup
// only ever selects endpoints owned solely by quarantined artifacts, and keeps everything uncertain.
import test from 'node:test'
import assert from 'node:assert/strict'
import { liveEndpointDeletable, planMassEndpointCleanup, type EndpointReference } from '../lib/ai/cos/runpodEndpointCleanupPlan.ts'

const now = new Date('2026-09-27T20:00:00Z')
const old = '2026-09-26T10:00:00Z'
const ref = (endpointId: string, candidateId: string, observedAt = old, retired = false): EndpointReference =>
  ({ endpointId, candidateId, subjectId: 'Mathematics', observedAt, retired })
const statuses = new Map([
  ['mass:q1', 'quarantined'], ['mass:q2', 'quarantined'], ['mass:p1', 'evaluation_pending'], ['mass:g1', 'graduated'],
])
const plan = (references: EndpointReference[], protectedText: string[] = []) =>
  planMassEndpointCleanup({ references, artifactStatusByCandidate: statuses, protectedText, now })

test('an idle endpoint used only by quarantined artifacts is eligible', () => {
  const result = plan([ref('abcd1234ef', 'mass:q1'), ref('abcd1234ef', 'mass:q2')])
  assert.deepEqual(result.eligible.map(item => item.endpointId), ['abcd1234ef'])
  assert.deepEqual([...result.eligible[0].candidateIds].sort(), ['mass:q1', 'mass:q2'])
})

test('an endpoint shared with any non-terminal artifact is kept', () => {
  const result = plan([ref('shared0001', 'mass:q1'), ref('shared0001', 'mass:p1')])
  assert.equal(result.eligible.length, 0)
  assert.equal(result.kept.referenced_by_non_terminal_artifact, 1)
})

test('graduated, unknown and non-mass references are kept', () => {
  assert.equal(plan([ref('grad000001', 'mass:g1')]).eligible.length, 0)
  assert.equal(plan([ref('unknown001', 'mass:zz')]).eligible.length, 0)
  assert.equal(plan([ref('nonmass001', 'study-plan:x')]).kept.referenced_by_non_mass_candidate, 1)
})

test('the graduate runtime and registry are protected even when the artifact is quarantined', () => {
  const result = plan([ref('liveruntime1', 'mass:q1')], ['https://liveruntime1.api.runpod.ai/v1'])
  assert.equal(result.eligible.length, 0)
  assert.equal(result.kept.protected_runtime_or_registry, 1)
})

test('recently referenced and already retired endpoints are kept', () => {
  assert.equal(plan([ref('recent0001', 'mass:q1', '2026-09-27T18:00:00Z')]).kept.referenced_recently, 1)
  assert.equal(plan([ref('retired001', 'mass:q1'), ref('retired001', 'mass:q1', old, true)]).kept.already_retired, 1)
})

test('RunPod must confirm the endpoint is ours and has no workers before deletion', () => {
  assert.equal(liveEndpointDeletable({ name: 'itmounts-mass-distilled-abc-v3', workersMin: 0, workersMax: 0 }), true)
  assert.equal(liveEndpointDeletable({ name: 'itmounts-mass-distilled-abc-v3', workersMin: 0, workersMax: 1 }), false)
  assert.equal(liveEndpointDeletable({ name: 'itmounts-distilled-reasoning-primary', workersMin: 0, workersMax: 0 }), false)
  assert.equal(liveEndpointDeletable(null), false)
})
