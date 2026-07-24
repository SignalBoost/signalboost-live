import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortableBrowserHealthReadinessSnapshot } from '../lib/portable-browser/browser-health-readiness.ts'

const lifecycle = Object.freeze({
  status: 'healthy' as const,
  activeSessions: 1,
  trackedSessions: 1,
  maximumConcurrentSessions: 10,
  expiredSessions: 0,
  failedSessions: 0,
})

test('reports ready and healthy when all required components are healthy', () => {
  const snapshot = buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 100,
    configurationValid: true,
    lifecycle,
    components: [
      { componentId: 'session-provider', required: true, status: 'healthy', checkedAt: 90, latencyMs: 12 },
      { componentId: 'telemetry', required: false, status: 'healthy', checkedAt: 95 },
    ],
  })
  assert.equal(snapshot.health, 'healthy')
  assert.equal(snapshot.readiness, 'ready')
  assert.deepEqual(snapshot.reasons, [])
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.components))
})

test('fails readiness for invalid configuration or degraded lifecycle', () => {
  const invalid = buildPortableBrowserHealthReadinessSnapshot({ generatedAt: 10, configurationValid: false, lifecycle, components: [] })
  assert.equal(invalid.readiness, 'not_ready')
  assert.ok(invalid.reasons.includes('configuration_invalid'))

  const degraded = buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 10,
    configurationValid: true,
    lifecycle: { ...lifecycle, status: 'degraded', failedSessions: 1 },
    components: [],
  })
  assert.equal(degraded.health, 'degraded')
  assert.equal(degraded.readiness, 'not_ready')
  assert.ok(degraded.reasons.includes('lifecycle_degraded'))
})

test('distinguishes required failures from optional outages', () => {
  const required = buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 50,
    configurationValid: true,
    lifecycle,
    components: [{ componentId: 'provider', required: true, status: 'unavailable', checkedAt: 45 }],
  })
  assert.equal(required.health, 'unavailable')
  assert.equal(required.readiness, 'not_ready')

  const optional = buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 50,
    configurationValid: true,
    lifecycle,
    components: [{ componentId: 'telemetry', required: false, status: 'unavailable', checkedAt: 45 }],
  })
  assert.equal(optional.health, 'degraded')
  assert.equal(optional.readiness, 'ready')
})

test('sorts components and redacts diagnostic secrets', () => {
  const snapshot = buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 100,
    configurationValid: true,
    lifecycle,
    components: [
      { componentId: 'zeta', required: false, status: 'degraded', checkedAt: 90, message: 'apiKey=super-secret failed\nretry' },
      { componentId: 'alpha', required: true, status: 'healthy', checkedAt: 80 },
    ],
  })
  assert.deepEqual(snapshot.components.map(component => component.componentId), ['alpha', 'zeta'])
  assert.doesNotMatch(snapshot.components[1]?.message ?? '', /super-secret/)
  assert.match(snapshot.components[1]?.message ?? '', /\[redacted\]/)
})

test('rejects duplicates, future probes, unsafe IDs, and invalid latency', () => {
  assert.throws(() => buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 10,
    configurationValid: true,
    lifecycle,
    components: [
      { componentId: 'provider', required: true, status: 'healthy', checkedAt: 9 },
      { componentId: 'provider', required: false, status: 'healthy', checkedAt: 9 },
    ],
  }), /duplicate_component/)
  assert.throws(() => buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 10,
    configurationValid: true,
    lifecycle,
    components: [{ componentId: 'provider', required: true, status: 'healthy', checkedAt: 11 }],
  }), /future_probe/)
  assert.throws(() => buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 10,
    configurationValid: true,
    lifecycle,
    components: [{ componentId: 'Invalid Provider', required: true, status: 'healthy', checkedAt: 9 }],
  }), /component_id_invalid/)
  assert.throws(() => buildPortableBrowserHealthReadinessSnapshot({
    generatedAt: 10,
    configurationValid: true,
    lifecycle,
    components: [{ componentId: 'provider', required: true, status: 'healthy', checkedAt: 9, latencyMs: -1 }],
  }), /latency_invalid/)
})
