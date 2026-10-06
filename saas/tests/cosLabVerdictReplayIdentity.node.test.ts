import assert from 'node:assert/strict'
import { test } from 'node:test'
import { labFailureVerdictEventKey } from '../lib/ai/cos/cosLabFailureVerdictIngestion.ts'

const verdict = { jobId: 'job-123', providerStage: 'ERROR', verdict: 'PLATFORM_FAILURE' as const,
  verifierId: 'independent', evidenceRef: 'db://evidence/1', evidenceHash: 'a'.repeat(64),
  issuedAt: '2026-10-06T12:00:00Z', signatureBase64: 'signature' }

test('same signed claim has one event identity regardless of transport idempotency key or signature encoding', () => {
  const original = labFailureVerdictEventKey(verdict)
  assert.equal(original, labFailureVerdictEventKey({ ...verdict, signatureBase64: 'alternate-encoding' }))
  assert.equal(original, labFailureVerdictEventKey({ ...verdict, evidenceHash: 'A'.repeat(64) }))
})
test('different claim evidence or job has a distinct event identity', () => {
  const original = labFailureVerdictEventKey(verdict)
  assert.notEqual(original, labFailureVerdictEventKey({ ...verdict, jobId: 'job-456' }))
  assert.notEqual(original, labFailureVerdictEventKey({ ...verdict, evidenceHash: 'b'.repeat(64) }))
})
