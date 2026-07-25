import test from 'node:test'
import assert from 'node:assert/strict'
import {
  admitThroughCircuit,
  beginCircuitProbe,
  createCircuitBreakerKey,
  createCircuitBreakerSnapshot,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '../agent-gateway/index.ts'

const dependency = {
  tenantId: 'acme',
  environment: 'prod',
  kind: 'provider' as const,
  dependencyId: 'github',
}

const policy = { failureThreshold: 3, openDurationMs: 30_000 }

test('circuit identity is tenant, environment, kind, and dependency scoped', () => {
  assert.equal(createCircuitBreakerKey(dependency), 'acme:prod:provider:github')
  assert.notEqual(
    createCircuitBreakerKey(dependency),
    createCircuitBreakerKey({ ...dependency, tenantId: 'other' }),
  )
})

test('closed circuit allows dependency traffic and remains non-executable', () => {
  const snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  const admission = admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:01Z'))
  assert.equal(admission.disposition, 'allow')
  assert.equal(admission.readOnly, true)
  assert.equal(admission.executable, false)
  assert.ok(Object.isFrozen(snapshot))
})

test('bounded failures open only the affected dependency circuit', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:01Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:02Z'))
  assert.equal(snapshot.state, 'closed')
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:03Z'))
  assert.equal(snapshot.state, 'open')
  assert.equal(snapshot.retryAfter, '2026-07-25T20:00:33.000Z')
  assert.equal(admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:10Z')).disposition, 'reject_dependency_only')
})

test('retry window permits one half-open probe and rejects concurrent probes', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 1, openDurationMs: 1_000 }, new Date('2026-07-25T20:00:01Z'))
  assert.equal(admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:02.001Z')).disposition, 'probe')
  snapshot = beginCircuitProbe(snapshot, new Date('2026-07-25T20:00:02.001Z'))
  assert.equal(admitThroughCircuit(snapshot, new Date('2026-07-25T20:00:02.002Z')).disposition, 'reject_dependency_only')
  assert.throws(() => beginCircuitProbe(snapshot), /already in flight/)
})

test('successful probe closes and resets the circuit', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'rate_limit', { failureThreshold: 1, openDurationMs: 1_000 }, new Date('2026-07-25T20:00:01Z'))
  snapshot = beginCircuitProbe(snapshot, new Date('2026-07-25T20:00:02Z'))
  snapshot = recordCircuitSuccess(snapshot, new Date('2026-07-25T20:00:03Z'))
  assert.equal(snapshot.state, 'closed')
  assert.equal(snapshot.consecutiveFailures, 0)
  assert.equal(snapshot.retryAfter, null)
  assert.equal(snapshot.probeInFlight, false)
})

test('failed half-open probe reopens the circuit', () => {
  let snapshot = createCircuitBreakerSnapshot(dependency, new Date('2026-07-25T20:00:00Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 1, openDurationMs: 1_000 }, new Date('2026-07-25T20:00:01Z'))
  snapshot = beginCircuitProbe(snapshot, new Date('2026-07-25T20:00:02Z'))
  snapshot = recordCircuitFailure(snapshot, 'timeout', policy, new Date('2026-07-25T20:00:03Z'))
  assert.equal(snapshot.state, 'open')
  assert.equal(snapshot.retryAfter, '2026-07-25T20:00:33.000Z')
})

test('invalid identities, policies, clocks, and retry state fail closed', () => {
  assert.throws(() => createCircuitBreakerSnapshot({ ...dependency, tenantId: ' ' }), /invalid circuit tenantId/)
  const snapshot = createCircuitBreakerSnapshot(dependency)
  assert.throws(() => recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 0, openDurationMs: 1_000 }), /failureThreshold/)
  assert.throws(() => recordCircuitFailure(snapshot, 'timeout', { failureThreshold: 1, openDurationMs: 999 }), /openDurationMs/)
  assert.throws(() => createCircuitBreakerSnapshot(dependency, new Date('invalid')), /invalid circuit clock/)
  assert.throws(() => admitThroughCircuit({ ...snapshot, state: 'open', retryAfter: null }), /invalid circuit retryAfter/)
})
