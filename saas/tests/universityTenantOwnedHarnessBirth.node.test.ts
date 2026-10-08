import assert from 'node:assert/strict'
import test from 'node:test'
import { issueTenantOwnedHarnessBirth } from '../lib/ai/cos/universityTenantOwnedHarnessBirth.ts'

test('Phase 2: denied Harness cannot query tenant storage, sign, or persist', async () => {
  let reads = 0, signs = 0, writes = 0
  const query: any = {
    select: () => query, eq: () => query,
    maybeSingle: async () => { reads++; return { data: null, error: null } },
  }
  const result = await issueTenantOwnedHarnessBirth({
    tenantId: '11111111-1111-4111-8111-111111111111',
    harnessRunId: 'run-denied',
    permanentArtifactId: '22222222-2222-4222-8222-222222222222',
    db: { schema: () => ({ from: () => query }), from: () => query },
    resolveTrustedRun: async () => null,
    signer: async () => { signs++; return new Uint8Array() },
    issuerPublicKeyPem: '', trustedIssuerFingerprint: '',
    insertTenantOwnedOnce: async () => { writes++; return true },
  })
  assert.equal(result, 'invalid_grant')
  assert.deepEqual({ reads, signs, writes }, { reads: 0, signs: 0, writes: 0 })
})

test('Phase 2: authorized Harness but foreign-owned artifact cannot sign or write', async () => {
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const artifactId = '22222222-2222-4222-8222-222222222222'
  let ownerReads = 0, birthReads = 0, signs = 0, writes = 0
  const ownerQuery: any = {
    select: () => ownerQuery, eq: () => ownerQuery,
    maybeSingle: async () => {
      ownerReads++
      return { data: { permanent_artifact_id: artifactId,
        organization_id: '33333333-3333-4333-8333-333333333333' }, error: null }
    },
  }
  const birthQuery: any = {
    select: () => birthQuery, eq: () => birthQuery,
    maybeSingle: async () => { birthReads++; return { data: null, error: null } },
  }
  const manifest: any = {
    runId: 'approved-run', profile: 'production',
    identity: { tenantId, artifact: { artifactId } },
    authorityManifestRef: 'trusted-authority',
    environment: { class: 'production', environmentId: 'test' },
    capabilities: [{
      id: 'university.artifact.birth.sign',
      risk: 'consequential', mutating: true, environments: ['production'],
      scopes: [artifactId],
    }],
  }
  const outcome = await issueTenantOwnedHarnessBirth({
    tenantId, permanentArtifactId: artifactId, harnessRunId: 'approved-run',
    db: { schema: () => ({ from: () => ownerQuery }), from: () => birthQuery },
    resolveTrustedRun: async () => ({
      manifest, status: 'active' as const, authorityVerified: true,
    }),
    signer: async () => { signs++; return new Uint8Array() },
    issuerPublicKeyPem: '', trustedIssuerFingerprint: '',
    insertTenantOwnedOnce: async () => { writes++; return true },
  })
  assert.notEqual(outcome, 'verified_persisted')
  assert.equal(ownerReads, 1)
  assert.deepEqual({ birthReads, signs, writes }, { birthReads: 0, signs: 0, writes: 0 })
})
