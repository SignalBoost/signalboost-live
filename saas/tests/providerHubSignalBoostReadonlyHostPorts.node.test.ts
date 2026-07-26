import assert from 'node:assert/strict'
import test from 'node:test'

import { createProviderConnectionMetadata } from '../provider-hub-core/index.ts'
import { createSignalBoostReadonlyHostPorts } from '../provider-hub-host/signalboost-readonly-host-ports.ts'

const scope = { tenantId: 'tenant-a', environmentId: 'test' }

function createPorts() {
  const auditEvents: unknown[] = []
  const ports = createSignalBoostReadonlyHostPorts({
    ...scope,
    async resolveActor(input) {
      return { ...input, roles: ['operator'] }
    },
    async resolveConnectionOwner() {
      return { ownerId: 'owner-1' }
    },
    async appendAudit(event) {
      auditEvents.push(event)
    },
    async checkEntitlement(input) {
      return { entitled: input.capability === 'provider.read', entitlementRef: 'entitlement-1' }
    },
  })
  return { ports, auditEvents }
}

const identity = { ...scope, connectionId: 'connection-1', providerId: 'openai' }
const connection = createProviderConnectionMetadata({
  ...identity,
  state: 'configured',
  authentication: { method: 'api_key', configured: true, maskedFields: { publicField: 'saved' } },
  updatedAt: '2026-07-25T00:00:00.000Z',
})

test('creates immutable scoped read-only host ports', async () => {
  const { ports } = createPorts()
  assert.equal(Object.isFrozen(ports), true)
  assert.deepEqual(await ports.identity.resolveActor({ actorId: 'actor-1', ...scope }), {
    actorId: 'actor-1',
    ...scope,
    roles: ['operator'],
  })
  assert.deepEqual(await ports.identity.resolveConnectionOwner(identity), { ownerId: 'owner-1' })
  assert.deepEqual(await ports.licensing.checkEntitlement({ ...scope, capability: 'provider.read' }), {
    entitled: true,
    entitlementRef: 'entitlement-1',
  })
})

test('fails closed across tenant and environment boundaries', async () => {
  const { ports } = createPorts()
  await assert.rejects(
    ports.identity.resolveActor({ actorId: 'actor-1', tenantId: 'tenant-b', environmentId: 'test' }),
    /scope mismatch/,
  )
  await assert.rejects(
    ports.licensing.checkEntitlement({ tenantId: 'tenant-a', environmentId: 'production', capability: 'provider.read' }),
    /scope mismatch/,
  )
})

test('keeps vault mutation and automatic approval disabled', async () => {
  const { ports } = createPorts()
  await assert.rejects(
    ports.vault.storeSecret({ identity, secretEnvelope: { token: 'never-store' } }),
    /secret mutation is disabled/,
  )
  const approval = await ports.approvals.request({
    actor: { actorId: 'actor-1', ...scope, roles: ['operator'] },
    connection: identity,
    action: 'provider.publish',
    reason: 'operator requested review',
  })
  assert.equal(approval.decision, 'pending')
  assert.equal(approval.approvalId, 'pending:tenant-a:test:connection-1:provider.publish')
})

test('forwards immutable audit events and sanitizes UI projections deterministically', async () => {
  const { ports, auditEvents } = createPorts()
  await ports.audit.append({
    eventId: 'event-1',
    eventType: 'provider.connection.viewed',
    actorId: 'actor-1',
    ...scope,
    connectionId: 'connection-1',
    occurredAt: '2026-07-25T00:00:00.000Z',
  })
  assert.equal(auditEvents.length, 1)
  assert.equal(Object.isFrozen(auditEvents[0]), true)

  const projection = ports.ui.project({
    actor: { actorId: 'actor-1', ...scope, roles: ['operator'] },
    connection,
    allowedActions: ['view', 'inspect', 'view'],
    notices: ['read only', 'approval required'],
  })
  assert.deepEqual(projection.allowedActions, ['inspect', 'view'])
  assert.deepEqual(projection.notices, ['approval required', 'read only'])
  assert.equal(Object.isFrozen(projection), true)
  assert.equal(Object.isFrozen(projection.connection.authentication.maskedFields), true)
})
