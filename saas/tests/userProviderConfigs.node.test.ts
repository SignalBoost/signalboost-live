import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  PROVIDER_HUB_CONNECTION_SCHEMA_VERSION,
  createProviderConnectionMetadata,
} from '../provider-hub-core/index.ts'
import { createSignalBoostProviderConnectionPort } from '../provider-hub-host/signalboost-provider-config-adapter.ts'
import './providerHubHostPorts.node.test.ts'
import './providerHubContractIsolation.node.test.ts'
import './providerHubStatusSurface.node.test.ts'
import './providerHubStatusDashboard.node.test.ts'
import './providerHubReferenceDeployment.node.test.ts'
import './providerHubDocumentation.node.test.ts'
import './androidPackagingReadiness.node.test.ts'
import './androidUnsignedScaffold.node.test.ts'
import './androidScaffoldReviewBundle.node.test.ts'
import './androidBuildPlan.node.test.ts'

const originalVaultMasterKey = process.env.VAULT_MASTER_KEY

test('encrypts, masks, and decrypts provider keys without exposing plaintext in envelopes', async () => {
  process.env.VAULT_MASTER_KEY = 'a'.repeat(64)
  const { decryptProviderKeys, encryptProviderKeys, maskProviderKeys } = await import('../lib/engine/userProviderConfigs.ts')

  const encrypted = encryptProviderKeys({ apiKey: 'sk-test-12345' })

  assert.equal(typeof encrypted.apiKey.valueEncrypted, 'string')
  assert.notEqual(encrypted.apiKey.valueEncrypted, 'sk-test-12345')
  assert.equal(encrypted.apiKey.last4, '2345')
  assert.deepEqual(maskProviderKeys(encrypted), { apiKey: '••••2345' })
  assert.deepEqual(decryptProviderKeys(encrypted), { apiKey: 'sk-test-12345' })

  if (originalVaultMasterKey === undefined) delete process.env.VAULT_MASTER_KEY
  else process.env.VAULT_MASTER_KEY = originalVaultMasterKey
})

test('Provider Hub public metadata is versioned, immutable, and tenant scoped', () => {
  const metadata = createProviderConnectionMetadata({
    tenantId: 'tenant-1',
    environmentId: 'production',
    connectionId: 'connection-1',
    providerId: 'openai',
    state: 'validated',
    authentication: { method: 'api_key', configured: true, maskedFields: { account: '••••2345' } },
    updatedAt: '2026-07-25T23:00:00.000Z',
  })

  assert.equal(metadata.schemaVersion, PROVIDER_HUB_CONNECTION_SCHEMA_VERSION)
  assert.equal(metadata.tenantId, 'tenant-1')
  assert.equal(metadata.environmentId, 'production')
  assert.ok(Object.isFrozen(metadata))
  assert.ok(Object.isFrozen(metadata.authentication))
  assert.ok(Object.isFrozen(metadata.authentication.maskedFields))
})

test('Provider Hub rejects missing scope, secret-shaped fields, and unsafe mask values', () => {
  const base = {
    tenantId: 'tenant-1', environmentId: 'production', connectionId: 'connection-1',
    providerId: 'openai', state: 'configured' as const,
    authentication: { method: 'api_key' as const, configured: true, maskedFields: {} },
    updatedAt: '2026-07-25T23:00:00.000Z',
  }
  assert.throws(() => createProviderConnectionMetadata({ ...base, tenantId: '' }), /tenantId is required/)
  assert.throws(() => createProviderConnectionMetadata({
    ...base,
    authentication: { ...base.authentication, maskedFields: { apiKey: 'plaintext' } },
  }), /secret-shaped public field rejected/)
  assert.throws(() => createProviderConnectionMetadata({
    ...base,
    authentication: { ...base.authentication, maskedFields: { account: 'sk-live-secret' } },
  }), /unsafe masked value rejected/)
})

test('SignalBoost provider store satisfies the Provider Hub persistence port', async () => {
  const port = createSignalBoostProviderConnectionPort({
    async getUserProviderConfig(userId: string) {
      assert.equal(userId, 'user-1')
      return {
        user_id: userId,
        active_provider: 'openai',
        byok_enabled: true,
        encrypted_keys: { apiKey: { valueEncrypted: 'cipher', iv: 'iv', tag: 'tag' } },
        updated_at: '2026-07-25T23:00:00.000Z',
      }
    },
  }, (identity) => {
    if (identity.tenantId !== 'tenant-1' || identity.environmentId !== 'production') return null
    if (identity.connectionId !== 'connection-1' || identity.providerId !== 'openai') return null
    return 'user-1'
  })

  const connection = await port.getConnection({
    tenantId: 'tenant-1', environmentId: 'production', connectionId: 'connection-1', providerId: 'openai',
  })
  assert.equal(connection?.state, 'configured')
  assert.equal(connection?.authentication.configured, true)
  assert.deepEqual(connection?.authentication.maskedFields, { apiField: 'saved' })

  const crossScope = await port.getConnection({
    tenantId: 'tenant-2', environmentId: 'production', connectionId: 'connection-1', providerId: 'openai',
  })
  assert.equal(crossScope, null)
})

test('Provider Hub core remains Node-safe and host-neutral', async () => {
  const source = await readFile(new URL('../provider-hub-core/index.ts', import.meta.url), 'utf8')
  for (const forbidden of ['next/', '@supabase', 'vault/', 'execute-runner', 'lib/hub/', 'provider-framework/']) {
    assert.equal(source.includes(forbidden), false, `core must not import ${forbidden}`)
  }
})
