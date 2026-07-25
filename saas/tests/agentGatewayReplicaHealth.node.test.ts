import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AgentGatewayContinuityController,
  InMemoryContinuityStore,
  assessReplicaHealth,
  createReplicaHeartbeat,
  planReplicaTakeover,
  renewContinuityLease,
} from '../agent-gateway/index.ts'

const identity = {
  tenantId: 'acme',
  environment: 'prod',
  protocol: 'mcp',
  requestId: 'req-1',
  actionKind: 'tool_call',
  target: 'restart-worker',
}

test('heartbeat health progresses from healthy to unhealthy to abandoned', () => {
  const heartbeat = createReplicaHeartbeat({ replicaId: 'gw-a', role: 'gateway', region: 'us-east', version: '1.0.0', queueDepth: 1, activeLeaseCount: 1, restartCount: 0, healthScore: 95 }, new Date('2026-07-25T20:00:00Z'))
  assert.equal(assessReplicaHealth(heartbeat, 'gw-a', new Date('2026-07-25T20:00:05Z')).state, 'healthy')
  assert.equal(assessReplicaHealth(heartbeat, 'gw-a', new Date('2026-07-25T20:00:20Z')).state, 'unhealthy')
  assert.equal(assessReplicaHealth(heartbeat, 'gw-a', new Date('2026-07-25T20:01:00Z')).state, 'abandoned')
})

test('critical score marks a current heartbeat unhealthy', () => {
  const heartbeat = createReplicaHeartbeat({ replicaId: 'gw-a', role: 'gateway', region: 'us-east', version: '1.0.0', queueDepth: 0, activeLeaseCount: 0, restartCount: 2, healthScore: 20 }, new Date('2026-07-25T20:00:00Z'))
  assert.equal(assessReplicaHealth(heartbeat, 'gw-a', new Date('2026-07-25T20:00:01Z')).state, 'unhealthy')
})

test('current owner renews lease and stale owner is rejected', async () => {
  const store = new InMemoryContinuityStore()
  const controller = new AgentGatewayContinuityController(store, () => new Date('2026-07-25T20:00:00Z'))
  const admitted = await controller.admit(identity, 'gw-a', 30_000)
  assert.equal(admitted.disposition, 'acquired')
  if (admitted.disposition !== 'acquired') return
  const renewed = await renewContinuityLease(store, admitted.lease, 'gw-a', new Date('2026-07-25T20:00:10Z'), 30_000)
  assert.equal(renewed.expiresAt, '2026-07-25T20:00:40.000Z')
  await assert.rejects(() => renewContinuityLease(store, admitted.lease, 'gw-b', new Date('2026-07-25T20:00:11Z')), /stale owner/)
})

test('takeover waits for lease expiry then becomes eligible', async () => {
  const store = new InMemoryContinuityStore()
  const controller = new AgentGatewayContinuityController(store, () => new Date('2026-07-25T20:00:00Z'))
  const admitted = await controller.admit(identity, 'gw-a', 30_000)
  if (admitted.disposition !== 'acquired') return
  const heartbeat = createReplicaHeartbeat({ replicaId: 'gw-a', role: 'gateway', region: 'us-east', version: '1.0.0', queueDepth: 1, activeLeaseCount: 1, restartCount: 0, healthScore: 90 }, new Date('2026-07-25T19:58:00Z'))
  const health = assessReplicaHealth(heartbeat, 'gw-a', new Date('2026-07-25T20:00:20Z'))
  assert.equal(planReplicaTakeover(admitted.lease, health, 'gw-b', new Date('2026-07-25T20:00:20Z')).disposition, 'wait-for-expiry')
  assert.equal(planReplicaTakeover(admitted.lease, health, 'gw-b', new Date('2026-07-25T20:00:31Z')).disposition, 'takeover-eligible')
})

test('protected consequential work never receives blind takeover approval', async () => {
  const store = new InMemoryContinuityStore()
  const controller = new AgentGatewayContinuityController(store, () => new Date('2026-07-25T20:00:00Z'))
  const admitted = await controller.admit(identity, 'gw-a', 30_000)
  if (admitted.disposition !== 'acquired') return
  const health = assessReplicaHealth(null, 'gw-a', new Date('2026-07-25T20:01:00Z'))
  const plan = planReplicaTakeover(admitted.lease, health, 'gw-b', new Date('2026-07-25T20:01:00Z'), true)
  assert.equal(plan.disposition, 'protected-halt')
})
