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
