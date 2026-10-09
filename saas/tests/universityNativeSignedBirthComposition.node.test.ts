import assert from 'node:assert/strict'
import test from 'node:test'
import { issueUniversityNativeBirthWithWriter } from '../lib/ai/cos/universityNativeSignedBirthComposition.ts'

test('untrusted Harness cannot invoke the database writer or signer', async () => {
  let reads = 0, writes = 0, signs = 0
  const query: any = {
    select: () => query, eq: () => query,
    maybeSingle: async () => { reads++; return { data: null, error: null } },
    insert: async () => { writes++; return { error: null } },
  }
  const verdict = await issueUniversityNativeBirthWithWriter({
    tenantId: 'university',
    harnessRunId: 'untrusted',
    permanentArtifactId: '22222222-2222-4222-8222-222222222222',
    db: { from: () => query },
    resolveTrustedRun: async () => null,
    signer: async () => { signs++; return new Uint8Array(64) },
    issuerPublicKeyPem: '',
    trustedIssuerFingerprint: '',
  })
  assert.equal(verdict, 'invalid_grant')
  assert.deepEqual({ reads, writes, signs }, { reads: 0, writes: 0, signs: 0 })
})
