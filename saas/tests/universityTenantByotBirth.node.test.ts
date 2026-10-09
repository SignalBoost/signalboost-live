import assert from 'node:assert/strict'
import test from 'node:test'
import { issueTenantByotBirth } from '../lib/ai/cos/universityTenantByotBirth.ts'

const artifactId = '22222222-2222-4222-8222-222222222222'

test('BYOT rejects an untrusted run before resolving tenant connections', async () => {
  let connections = 0
  const result = await issueTenantByotBirth({
    tenantId: 'customer-a', harnessRunId: 'untrusted', permanentArtifactId: artifactId,
    resolveTrustedRun: async () => null,
    resolveTenantProvider: async () => { connections++; throw new Error('connection_read_must_not_happen') },
  })
  assert.equal(result, 'invalid_grant')
  assert.equal(connections, 0)
})

test('BYOT does not issue using another tenant connection', async () => {
  // A trusted run is required independently, so even a cross-tenant
  // connection resolver is never allowed to substitute its own authority.
  const result = await issueTenantByotBirth({
    tenantId: 'customer-a', harnessRunId: 'untrusted', permanentArtifactId: artifactId,
    resolveTrustedRun: async () => null,
    resolveTenantProvider: async () => ({
      tenantId: 'customer-b', connectionId: 'other-tenant',
      trustedIssuerFingerprint: 'a'.repeat(64),
      issuerPublicKeyPem: 'wrong',
      signer: async () => new Uint8Array(64),
      readNativeBirth: async () => null, insertOnce: async () => true,
      readStored: async () => null,
    }),
  })
  assert.equal(result, 'invalid_grant')
})
