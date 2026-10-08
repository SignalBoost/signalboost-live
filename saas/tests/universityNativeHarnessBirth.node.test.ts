import assert from 'node:assert/strict'
import test from 'node:test'
import { issueUniversityNativeHarnessBirth } from '../lib/ai/cos/universityNativeHarnessBirth.ts'

test('University-native signing refuses untrusted Harness before reading any artifact', async () => {
  let reads = 0, signs = 0, writes = 0
  const query: any = { select: () => query, eq: () => query,
    maybeSingle: async () => { reads++; return { data: null, error: null } } }
  const outcome = await issueUniversityNativeHarnessBirth({
    tenantId: 'university-operator',
    harnessRunId: 'not-authorized',
    permanentArtifactId: '22222222-2222-4222-8222-222222222222',
    db: { from: () => query },
    resolveTrustedRun: async () => null,
    signer: async () => { signs++; return new Uint8Array() },
    issuerPublicKeyPem: '', trustedIssuerFingerprint: '',
    insertOnce: async () => { writes++; return true },
  })
  assert.equal(outcome, 'invalid_grant')
  assert.deepEqual({ reads, signs, writes }, { reads: 0, signs: 0, writes: 0 })
})
