import assert from 'node:assert/strict'
import test from 'node:test'
import { executeConfiguredUniversityBirthSigning } from '../lib/ai/cos/universityConfiguredBirthSigning.ts'

test('unconfigured production rejects before constructing KMS or reading DB', async () => {
  let created = 0, read = 0
  const outcome = await executeConfiguredUniversityBirthSigning({
    host: {
      tenantId: 'university',
      harnessRunId: 'nonexistent',
      permanentArtifactId: '22222222-2222-4222-8222-222222222222',
      resolveTrustedRun: async () => null,
      db: { from: () => { read++; throw new Error('unexpected_db') } } as any,
    },
    env: {},
    sdk: {
      KMSClient: class { constructor(_config: any) { created++ } async send() { throw new Error('unexpected_kms') } },
      DescribeKeyCommand: class { constructor(_input: any) {} },
      GetPublicKeyCommand: class { constructor(_input: any) {} },
      SignCommand: class { constructor(_input: any) {} },
    } as any,
  })
  assert.equal(outcome, 'configuration_missing')
  assert.equal(created, 0)
  assert.equal(read, 0)
})
test('configured but unauthorized Harness run cannot reach KMS', async () => {
  let sendCalls = 0
  const result = await executeConfiguredUniversityBirthSigning({
    host: {
      tenantId: 'university', harnessRunId: 'untrusted',
      permanentArtifactId: '22222222-2222-4222-8222-222222222222',
      resolveTrustedRun: async () => null,
      db: { from: () => { throw new Error('unexpected_db') } } as any,
    },
    env: {
      UNIVERSITY_BIRTH_KMS_REGION: 'us-east-1',
      UNIVERSITY_BIRTH_KMS_KEY_ARN: 'arn:aws:kms:us-east-1:123456789012:key/12345678-aaaa-4bbb-8ccc-123456789012',
      UNIVERSITY_BIRTH_ISSUER_FINGERPRINT_SHA256: 'a'.repeat(64),
    },
    sdk: {
      KMSClient: class { async send() { sendCalls++; throw new Error('unexpected_kms') } },
      DescribeKeyCommand: class { constructor(_input: any) {} },
      GetPublicKeyCommand: class { constructor(_input: any) {} },
      SignCommand: class { constructor(_input: any) {} },
    } as any,
  })
  assert.equal(result, 'invalid_grant')
  assert.equal(sendCalls, 0)
})
