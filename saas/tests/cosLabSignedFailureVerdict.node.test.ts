import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { test } from 'node:test'
import { verifySignedLabFailureVerdict } from '../lib/ai/cos/cosLabSignedFailureVerdict.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const trustedVerifierKeys = { independent: publicKey.export({ format: 'pem', type: 'spki' }).toString() }
const base = { jobId: 'job-123', providerStage: 'ERROR', verdict: 'PLATFORM_FAILURE' as const,
  verifierId: 'independent', evidenceRef: 'evidence://job-123', evidenceHash: 'a'.repeat(64), issuedAt: '2026-10-06T12:00:00Z' }
function signed(value = base) {
  const payload = JSON.stringify([value.jobId, value.providerStage, value.verdict, value.verifierId, value.evidenceRef, value.evidenceHash.toLowerCase(), value.issuedAt])
  return { ...value, signatureBase64: sign(null, Buffer.from(payload), privateKey).toString('base64') }
}
const check = (verdict: ReturnType<typeof signed>, expectedJobId = 'job-123') => verifySignedLabFailureVerdict({ verdict, expectedJobId, expectedProviderStage: 'ERROR', trustedVerifierKeys, now: new Date('2026-10-06T12:02:00Z') })

test('valid independent Ed25519 verdict binds job and evidence', () => {
  assert.equal(check(signed()), 'PLATFORM_FAILURE')
})
test('unsigned and tampered claims fail closed', () => {
  assert.equal(check({ ...signed(), signatureBase64: '' }), 'UNATTRIBUTED')
  assert.equal(check({ ...signed(), verdict: 'CUSTOMER_INFRA_FAILURE' }), 'UNATTRIBUTED')
  assert.equal(check({ ...signed(), evidenceHash: 'b'.repeat(64) }), 'UNATTRIBUTED')
  assert.equal(check(signed(), 'different-job'), 'UNATTRIBUTED')
  assert.equal(check({ ...signed(), verifierId: 'unknown' }), 'UNATTRIBUTED')
})
test('completed provider jobs never imply failure classification', () => {
  const verdict = signed({ ...base, providerStage: 'COMPLETED' })
  assert.equal(verifySignedLabFailureVerdict({ verdict, expectedJobId: 'job-123', expectedProviderStage: 'COMPLETED', trustedVerifierKeys, now: new Date('2026-10-06T12:02:00Z') }), 'UNATTRIBUTED')
})

test('expired and future-dated verdicts fail closed even with valid signatures', () => {
  const expired = signed({ ...base, issuedAt: '2026-10-06T11:50:00Z' })
  const future = signed({ ...base, issuedAt: '2026-10-06T12:04:00Z' })
  assert.equal(check(expired), 'UNATTRIBUTED')
  assert.equal(check(future), 'UNATTRIBUTED')
})
