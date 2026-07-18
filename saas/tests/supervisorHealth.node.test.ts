import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSupervisorHealth, type Lease, type SupervisorInstance } from '../lib/supervisor/index.ts'

const now = new Date('2026-07-18T18:00:00.000Z')
const instance = (overrides: Partial<SupervisorInstance> = {}): SupervisorInstance => ({
  instanceId: 'sup-1',
  runtimeId: 'run-1',
  region: 'iad1',
  startedAt: '2026-07-18T17:00:00.000Z',
  heartbeatAt: '2026-07-18T17:59:30.000Z',
  softwareVersion: '1.0.0',
  schemaVersion: 'supervisor-instance-v1',
  supportedProviderKinds: ['github'],
  status: 'healthy',
  ...overrides,
})
const lease = (overrides: Partial<Lease> = {}): Lease => ({
  leaseId: 'lease-work-1-1',
  workItemId: 'work-1',
  ownerInstanceId: 'sup-1',
  ownerRuntimeId: 'run-1',
  fencingToken: 1,
  acquiredAt: '2026-07-18T17:59:00.000Z',
  heartbeatAt: '2026-07-18T17:59:30.000Z',
  expiresAt: '2026-07-18T18:01:00.000Z',
  policyVersion: 'policy-v1',
  schemaVersion: 'supervisor-lease-v1',
  ...overrides,
})

test('zero healthy Supervisor instances is always critical with score zero', () => {
  const report = evaluateSupervisorHealth({ instances: [], activeLeases: [], providers: [], expectedProviders: [], now })
  assert.equal(report.status, 'critical')
  assert.equal(report.score, 0)
  assert.equal(report.totals.healthyInstances, 0)
  assert.equal(report.issues[0].code, 'no_healthy_instances')
})

test('fresh healthy instance with complete provider registration is healthy', () => {
  const report = evaluateSupervisorHealth({ instances: [instance()], activeLeases: [lease()], providers: [{ provider: 'github', registered: true }], expectedProviders: ['github'], now })
  assert.equal(report.status, 'healthy')
  assert.equal(report.score, 100)
  assert.deepEqual(report.issues, [])
})

test('stale heartbeat is critical and removes instance from healthy count', () => {
  const report = evaluateSupervisorHealth({ instances: [instance({ heartbeatAt: '2026-07-18T17:50:00.000Z' })], activeLeases: [], providers: [], expectedProviders: [], now })
  assert.equal(report.status, 'critical')
  assert.equal(report.score, 0)
  assert.equal(report.totals.staleHeartbeats, 1)
  assert.equal(report.issues.some(issue => issue.code === 'stale_heartbeat'), true)
})

test('expired or stale lease is critical', () => {
  const report = evaluateSupervisorHealth({ instances: [instance()], activeLeases: [lease({ expiresAt: '2026-07-18T17:59:59.000Z' })], providers: [], expectedProviders: [], now })
  assert.equal(report.status, 'critical')
  assert.equal(report.totals.staleLeases, 1)
})

test('missing required provider registration degrades health', () => {
  const report = evaluateSupervisorHealth({ instances: [instance()], activeLeases: [], providers: [{ provider: 'github', registered: true }], expectedProviders: ['github', 'vercel'], now })
  assert.equal(report.status, 'degraded')
  assert.equal(report.score, 90)
  assert.deepEqual(report.issues.map(issue => issue.subject), ['vercel'])
})

test('disabled provider does not satisfy registration integrity', () => {
  const report = evaluateSupervisorHealth({ instances: [instance()], activeLeases: [], providers: [{ provider: 'github', registered: true, enabled: false }], expectedProviders: ['github'], now })
  assert.equal(report.status, 'degraded')
  assert.equal(report.totals.missingProviders, 1)
})
