import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SIGNALBOOST_PROVIDER_HUB_HOST_FACTORY_VERSION,
  SIGNALBOOST_PROVIDER_HUB_HOST_ID,
  createSignalBoostProviderHubHostAdapter,
} from '../provider-hub-host/signalboost-host-adapter-factory.ts'

function dependencies() {
  return {
    tenantId: 'tenant-a',
    environmentId: 'test',
    store: { async getUserProviderConfig() { return null } },
    resolveUserId: async () => 'user-a',
    identity: {
      async resolveActor() { return null },
      async resolveConnectionOwner() { return null },
    },
    vault: {
      async storeSecret() { throw new Error('disabled') },
      async deleteSecret() { throw new Error('disabled') },
    },
    audit: { async append() {} },
    approvals: { async request() { return { approvalId: 'pending', decision: 'pending' as const } } },
    licensing: { async checkEntitlement() { return { entitled: false } } },
    ui: {
      project(input: any) {
        return Object.freeze({
          schemaVersion: 'provider-hub-host-ports-v1' as const,
          connection: input.connection,
          allowedActions: Object.freeze([]),
          notices: Object.freeze([]),
        })
      },
    },
  }
}

test('creates an immutable scoped SignalBoost host adapter', () => {
  const result = createSignalBoostProviderHubHostAdapter(dependencies())

  assert.equal(result.schemaVersion, SIGNALBOOST_PROVIDER_HUB_HOST_FACTORY_VERSION)
  assert.equal(result.adapter.hostId, SIGNALBOOST_PROVIDER_HUB_HOST_ID)
  assert.equal(result.adapter.tenantId, 'tenant-a')
  assert.equal(result.adapter.environmentId, 'test')
  assert.equal(result.adapter.executable, false)
  assert.equal(result.adapter.providerMutationEnabled, false)
  assert.equal(result.adapter.productionExecutionEnabled, false)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.adapter), true)
  assert.equal(Object.isFrozen(result.adapter.ports), true)
})

test('creates deterministic metadata for identical scope', () => {
  const first = createSignalBoostProviderHubHostAdapter(dependencies())
  const second = createSignalBoostProviderHubHostAdapter(dependencies())

  assert.deepEqual(
    {
      schemaVersion: first.schemaVersion,
      compositionVersion: first.compositionVersion,
      hostId: first.adapter.hostId,
      tenantId: first.adapter.tenantId,
      environmentId: first.adapter.environmentId,
    },
    {
      schemaVersion: second.schemaVersion,
      compositionVersion: second.compositionVersion,
      hostId: second.adapter.hostId,
      tenantId: second.adapter.tenantId,
      environmentId: second.adapter.environmentId,
    },
  )
})

test('rejects missing factory dependencies', () => {
  const input = dependencies()
  assert.throws(
    () => createSignalBoostProviderHubHostAdapter({ ...input, audit: undefined as never }),
    /missing SignalBoost provider hub dependency: audit/,
  )
})

test('preserves tenant and environment isolation', () => {
  const tenantA = createSignalBoostProviderHubHostAdapter(dependencies())
  const tenantB = createSignalBoostProviderHubHostAdapter({
    ...dependencies(),
    tenantId: 'tenant-b',
    environmentId: 'production',
  })

  assert.notEqual(tenantA.adapter.tenantId, tenantB.adapter.tenantId)
  assert.notEqual(tenantA.adapter.environmentId, tenantB.adapter.environmentId)
})
