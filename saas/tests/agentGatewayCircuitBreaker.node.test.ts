import test from 'node:test'
import assert from 'node:assert/strict'
import { admitThroughCircuit, beginCircuitProbe, createCircuitBreakerKey, createCircuitBreakerSnapshot, recordCircuitFailure, recordCircuitSuccess } from '../agent-gateway/index.ts'

const dependency = { tenantId: 'acme', environment: 'prod', kind: 'provider' as const, dependencyId: 'github' }
const policy = { failureThreshold: 3, openDurationMs: 30_000 }

test('circuit identity is scoped', () => {
  assert.equal(createCircuitBreakerKey(dependency), 'acme:prod:provider:github')
  assert.notEqual(createCircuitBreakerKey(dependency), createCircuitBreakerKey({ ...dependency, tenantId: 'other' }))
})

test('closed circuit allows dependency traffic', () => {
  const snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  const admission = admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:01Z'))
  assert.equal(admission.disposition, 'allow')
  assert.equal(admission.executable, false)
  assert.ok(Object.isFrozen(snapshot))
})

test('bounded failures open only the affected dependency', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:01Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:02Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:03Z'))
  assert.equal(snapshot.state, 'open')
  assert.equal(admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:10Z')).disposition, 'reject_dependency_only')
})

test('retry window permits one probe and rejects concurrent probes', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 1, openDurationMs: 1_000 }, new Date('2026-07-25T20:00:01Z'))
  assert.equal(admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:02.001Z')).disposition, 'probe')
  snapshot = beginCircuitProbe(snapshot, new Date('2026-07-25T20:00:02.001Z'))
  assert.equal(admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:02.002Z')).disposition, 'reject_dependency_only')
})

test('successful probe resets and failed probe reopens', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 1, openDurationMs: 1_000 }, new Date('2026-07-25T20:00:01Z'))
  snapshot = beginCircuitProbe(snapshot, new Date('2026-07-25T20:00:02Z'))
  const closed = recordCircuitSuccess(snapshot, new Date('2026-07-25T20:00:03Z'))
  assert.equal(closed.state, 'closed')
  const reopened = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:03Z'))
  assert.equal(reopened.state, 'open')
})

test('invalid state fails closed', () => {
  assert.throws(() => createCircuitBreakerSnapshot({ ...dependency, tenantId: ' ' }), /tenantId/)
  const snapshot = createCircuitBreakerSnapshot(dependency)
  assert.throws(() => recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 0, openDurationMs: 1_000 }), /failureThreshold/)
  assert.throws(() => admitThroughCircuit({ ...snapshot, state: 'open', retryAfter: null }), /retryAfter/)
})
