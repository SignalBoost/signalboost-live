import assert from 'node:assert/strict'
import test from 'node:test'
import { readUniversitySigningConfig } from '../lib/ai/cos/universityAwsSigningConfig.ts'

const valid = {
  UNIVERSITY_BIRTH_KMS_REGION: 'us-east-1',
  UNIVERSITY_BIRTH_KMS_KEY_ARN: 'arn:aws:kms:us-east-1:123456789012:key/12345678-aaaa-4bbb-8ccc-123456789012',
  UNIVERSITY_BIRTH_ISSUER_FINGERPRINT_SHA256: 'a'.repeat(64),
}
test('production signer requires all explicit parameters', () => {
  assert.deepEqual(readUniversitySigningConfig({}), { ok: false, reason: 'configuration_missing' })
  assert.equal(readUniversitySigningConfig(valid).ok, true)
})
test('reject cross-region keys and incorrect trust pins', () => {
  assert.equal(readUniversitySigningConfig({ ...valid, UNIVERSITY_BIRTH_KMS_REGION: 'eu-west-1' }).ok, false)
  assert.equal(readUniversitySigningConfig({ ...valid, UNIVERSITY_BIRTH_ISSUER_FINGERPRINT_SHA256: 'fake' }).ok, false)
  assert.equal(readUniversitySigningConfig({ ...valid, UNIVERSITY_BIRTH_KMS_KEY_ARN: 'alias/university-key' }).ok, false)
})
