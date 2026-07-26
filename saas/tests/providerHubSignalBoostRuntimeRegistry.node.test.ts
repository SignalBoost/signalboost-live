import assert from 'node:assert/strict'
import test from 'node:test'

import { assembleSignalBoostProviderHubRuntime } from '../provider-hub-host/signalboost-runtime-assembly.ts'
import { createSignalBoostProviderHubRuntimeRegistry } from '../provider-hub-host/signalboost-runtime-registry.ts'

function createRuntime(tenantId: string, environmentId: string) {
  return assembleSignalBoostProviderHubRuntime({
    tenantId,
    environmentId,
    store: {
      async getUserProviderConfig(userId: string) {
        return {
          user_id: userId,
          active_provider: 'openai',
          byok_enabled: true,
          encrypted_keys: { apiKey: 'ciphertext-never-listed' },
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
      return { entitled: input.capability === 'provider.read' }
    },
  })
}

test('registers and resolves immutable runtimes by host tenant and environment', () => {
  const registry = createSignalBoostProviderHubRuntimeRegistry()
  const runtime = createRuntime('tenant-a', 'test')
  const descriptor = registry.register(runtime)

  assert.equal(Object.isFrozen(registry), true)
  assert.equal(Object.isFrozen(descriptor), true)
  assert.equal(registry.has({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'test' }), true)
  assert.equal(registry.get({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'test' }), runtime)
  assert.equal(registry.get({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'production' }), null)
})

test('rejects duplicate runtime identities', () => {
  const registry = createSignalBoostProviderHubRuntimeRegistry()
  registry.register(createRuntime('tenant-a', 'test'))
  assert.throws(
    () => registry.register(createRuntime('tenant-a', 'test')),
    /runtime already registered/,
  )
})

test('lists deterministic public descriptors without runtime internals or secrets', () => {
  const registry = createSignalBoostProviderHubRuntimeRegistry()
  registry.register(createRuntime('tenant-b', 'production'))
  registry.register(createRuntime('tenant-a', 'test'))
  registry.register(createRuntime('tenant-a', 'production'))

  const listed = registry.list()
  assert.equal(Object.isFrozen(listed), true)
  assert.deepEqual(
    listed.map(item => `${item.hostId}/${item.tenantId}/${item.environmentId}`),
    [
      'signalboost/tenant-a/production',
      'signalboost/tenant-a/test',
      'signalboost/tenant-b/production',
    ],
  )
  assert.equal(JSON.stringify(listed).includes('ciphertext-never-listed'), false)
  assert.equal(JSON.stringify(listed).includes('adapter'), false)
  assert.equal(listed.every(item => item.readOnly && !item.executable && !item.productionExecutionEnabled), true)
})

test('fails closed for missing identity fields and unsafe runtimes', () => {
  const registry = createSignalBoostProviderHubRuntimeRegistry()
  assert.throws(
    () => registry.get({ hostId: '', tenantId: 'tenant-a', environmentId: 'test' }),
    /hostId is required/,
  )

  const unsafe = {
    ...createRuntime('tenant-a', 'test'),
    executable: true,
  }
  assert.throws(
    () => registry.register(unsafe as never),
    /rejected an unsafe runtime/,
  )
})
