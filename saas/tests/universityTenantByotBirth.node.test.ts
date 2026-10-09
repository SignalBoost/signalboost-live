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

test('BYOT refuses cross-tenant provider after a valid trusted Harness grant', async () => {
  let connections = 0, signs = 0, reads = 0, writes = 0
  const runId = 'trusted-birth-run'
  // The resolver stands in for the host's independently validated, durable run.
  // Unlike the untrusted-run case, this reaches the provider tenant check.
  const resolveTrustedRun = async () => ({
    status: 'active' as const,
    authorityVerified: true,
    manifest: {
      runId,
      identity: { tenantId: 'customer-a', artifact: { artifactId } },
      authorityManifestRef: 'trusted-host-authority',
      profile: 'production',
      environment: { class: 'staging' },
      capabilities: [{
        id: 'university.artifact.birth.sign',
        mutating: true,
        risk: 'consequential',
        environments: ['staging'],
        scopes: [artifactId],
      }],
    },
  })
  const result = await issueTenantByotBirth({
    tenantId: 'customer-a', harnessRunId: runId, permanentArtifactId: artifactId,
    resolveTrustedRun: resolveTrustedRun as any,
    resolveTenantProvider: async () => {
      connections++
      return {
        tenantId: 'customer-b', connectionId: 'other-tenant',
        trustedIssuerFingerprint: 'a'.repeat(64),
        issuerPublicKeyPem: 'wrong',
        signer: async () => { signs++; return new Uint8Array(64) },
        readNativeBirth: async () => { reads++; return null },
        insertOnce: async () => { writes++; return true },
        readStored: async () => { reads++; return null },
      }
    },
  })
  assert.equal(result, 'provider_unavailable')
  assert.deepEqual({ connections, signs, reads, writes }, {
    connections: 1, signs: 0, reads: 0, writes: 0,
  })
})
