import assert from 'node:assert/strict'
import test from 'node:test'
import { issueUniversityBirthUsingAwsKms } from '../lib/ai/cos/universityAwsKmsBirthHost.ts'

test('untrusted run rejects before KMS and database access', async () => {
  let kmsCalls = 0, databaseCalls = 0
  const failKms = async () => { kmsCalls++; throw new Error('KMS must never be called') }
  const verdict = await issueUniversityBirthUsingAwsKms({
    tenantId: 'university', harnessRunId: 'untrusted',
    permanentArtifactId: '22222222-2222-4222-8222-222222222222',
    resolveTrustedRun: async () => null,
    db: { from: () => { databaseCalls++; throw new Error('DB must never be called') } } as any,
    kms: { describeKey: failKms, getPublicKey: failKms, sign: failKms },
    keyId: 'not-a-real-key', trustedIssuerFingerprint: 'a'.repeat(64),
  })
  assert.equal(verdict, 'invalid_grant')
  assert.equal(kmsCalls, 0)
  assert.equal(databaseCalls, 0)
})
