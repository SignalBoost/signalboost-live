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
import './providerHubAndroidBuildReadiness.node.test.ts'
import './providerHubUnsignedBuildProvenance.node.test.ts'
import './providerHubDependencyReview.node.test.ts'
import './androidUnsignedScaffold.node.test.ts'
import './androidScaffoldReviewBundle.node.test.ts'
import './androidBuildPlan.node.test.ts'
import './androidBuildEvidence.node.test.ts'
import './androidBuildEvidenceManifest.node.test.ts'
import './androidPublicationReadiness.node.test.ts'
import './androidSignedBundleEvidence.node.test.ts'
import './androidPlayConsoleReleaseEvidence.node.test.ts'
import './androidPublicationEvidence.node.test.ts'
import './androidProductionPublicationEvidence.node.test.ts'

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
})
