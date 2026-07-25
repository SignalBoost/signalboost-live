import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AgentGatewayContinuityController,
  InMemoryContinuityStore,
  createContinuityRequestIdentity,
} from '../agent-gateway/index.ts'

const request = {
  tenantId: 'acme',
  environment: 'prod',
  protocol: 'mcp',
  requestId: 'req-001',
  actionKind: 'tool_call',
  target: 'restart-worker',
}

test('continuity identity is deterministic, tenant-scoped, and non-executable', () => {
  const first = createContinuityRequestIdentity(request)
  const second = createContinuityRequestIdentity({ ...request })
  const otherTenant = createContinuityRequestIdentity({ ...request, tenantId: 'other' })

  assert.equal(first.key, second.key)
  assert.equal(first.digest, second.digest)
  assert.notEqual(first.key, otherTenant.key)
  assert.equal(first.readOnly, true)
  assert.equal(first.executable, false)
  assert.equal(Object.isFrozen(first), true)
})

test('same owner receives duplicate admission while another replica is kept busy', async () => {
  const store = new InMemoryContinuityStore()
  const controller = new AgentGatewayContinuityController(store, () => new Date('2026-07-25T20:00:00.000Z'))

  const acquired = await controller.admit(request, 'gateway-a', 30_000)
  const duplicate = await controller.admit(request, 'gateway-a', 30_000)
  const busy = await controller.admit(request, 'gateway-b', 30_000)

  assert.equal(acquired.disposition, 'acquired')
  assert.equal(duplicate.disposition, 'duplicate')
  assert.equal(busy.disposition, 'busy')
  assert.equal(acquired.lease.fencingToken, 1)
  assert.equal(duplicate.lease.fencingToken, 1)
  assert.equal(busy.lease.ownerId, 'gateway-a')
})

test('expired ownership transfers automatically with a higher fencing token', async () => {
  let now = new Date('2026-07-25T20:00:00.000Z')
  const store = new InMemoryContinuityStore()
  const controller = new AgentGatewayContinuityController(store, () => now)

  const first = await controller.admit(request, 'gateway-a', 1_000)
  now = new Date('2026-07-25T20:00:01.001Z')
  const second = await controller.admit(request, 'gateway-b', 1_000)

  assert.equal(first.disposition, 'acquired')
  assert.equal(second.disposition, 'acquired')
  assert.equal(second.lease.ownerId, 'gateway-b')
  assert.equal(second.lease.fencingToken, 2)

  const current = await store.getLease(second.identity.key)
  assert.throws(() => controller.assertCurrentOwner(first.lease, current), /stale owner rejected/)
  assert.doesNotThrow(() => controller.assertCurrentOwner(second.lease, current))
})

test('invalid identities, durations, clocks, and fencing state fail closed', async () => {
  assert.throws(() => createContinuityRequestIdentity({ ...request, tenantId: ' ' }), /invalid continuity tenantId/)

  const store = new InMemoryContinuityStore()
  const controller = new AgentGatewayContinuityController(store, () => new Date('2026-07-25T20:00:00.000Z'))
  await assert.rejects(() => controller.admit(request, 'gateway-a', 999), /invalid continuity lease duration/)

  const badClock = new AgentGatewayContinuityController(store, () => new Date('invalid'))
  await assert.rejects(() => badClock.admit(request, 'gateway-a'), /invalid continuity clock/)

  const badStore = {
    async getLease() { return null },
    async putLease() {},
    async nextFencingToken() { return 0 },
  }
  const badToken = new AgentGatewayContinuityController(badStore, () => new Date('2026-07-25T20:00:00.000Z'))
  await assert.rejects(() => badToken.admit(request, 'gateway-a'), /invalid continuity fencing token/)
})
