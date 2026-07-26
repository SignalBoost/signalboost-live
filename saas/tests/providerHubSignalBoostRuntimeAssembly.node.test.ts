import assert from 'node:assert/strict'
import test from 'node:test'

import { assembleSignalBoostProviderHubRuntime } from '../provider-hub-host/signalboost-runtime-assembly.ts'

function createRuntime(tenantId = 'tenant-a', environmentId = 'test') {
  return assembleSignalBoostProviderHubRuntime({
    tenantId,
    environmentId,
    store: {
      async getUserProviderConfig(userId: string) {
        return {
          user_id: userId,
          active_provider: 'openai',
          byok_enabled: true,
          encrypted_keys: { apiKey: 'ciphertext-never-projected' },
          created_at: '2026-07-25T00:00:00.000Z',
          updated_at: '2026-07-25T00:00:00.000Z',
        }
      },
    },
    async resolveUserId(identity) {
      return identity.tenantId === tenantId && identity.environmentId === environmentId ? 'user-1' : null
    },
    async resolveActor(input) {
      return { ...input, roles: ['operator'] }
    },
    async resolveConnectionOwner() {
      return { ownerId: 'user-1' }
    },
    async appendAudit() {},
    async checkEntitlement(input) {
      return { entitled: input.capability === 'provider.read', entitlementRef: 'entitlement-1' }
    },
  })
}

test('assembles a deterministic immutable read-only SignalBoost runtime', async () => {
  const runtime = createRuntime()
  assert.equal(Object.isFrozen(runtime), true)
  assert.equal(runtime.adapter.hostId, 'signalboost')
  assert.equal(runtime.adapter.tenantId, 'tenant-a')
  assert.equal(runtime.adapter.environmentId, 'test')
  assert.equal(runtime.readOnly, true)
  assert.equal(runtime.executable, false)
  assert.equal(runtime.secretRetrievalEnabled, false)
  assert.equal(runtime.providerMutationEnabled, false)
  assert.equal(runtime.productionExecutionEnabled, false)

  const connection = await runtime.adapter.ports.persistence.getConnection({
    tenantId: 'tenant-a',
    environmentId: 'test',
    connectionId: 'connection-1',
    providerId: 'openai',
  })
  assert.equal(connection?.state, 'configured')
  assert.deepEqual(connection?.authentication.maskedFields, { apiField: 'saved' })
  assert.equal(JSON.stringify(connection).includes('ciphertext-never-projected'), false)
})

test('keeps tenant and environment assemblies isolated', () => {
  const first = createRuntime('tenant-a', 'test')
  const second = createRuntime('tenant-b', 'production')
  assert.notEqual(first.adapter.tenantId, second.adapter.tenantId)
  assert.notEqual(first.adapter.environmentId, second.adapter.environmentId)
})

test('rejects missing runtime dependencies', () => {
  assert.throws(
    () => assembleSignalBoostProviderHubRuntime({
      tenantId: 'tenant-a',
      environmentId: 'test',
      store: null as never,
      resolveUserId: async () => null,
      resolveActor: async () => null,
      resolveConnectionOwner: async () => null,
      appendAudit: async () => {},
      checkEntitlement: async () => ({ entitled: false }),
    }),
    /missing SignalBoost provider hub runtime dependency: store/,
  )
})
