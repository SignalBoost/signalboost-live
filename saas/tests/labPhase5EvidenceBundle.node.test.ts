import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPhase5EvidenceBundle } from '../lib/ai/cos/labPhase5EvidenceBundle.ts'
test('unsigned empty evidence bundle is rejected', () => {
  const result = verifyPhase5EvidenceBundle({ review: { partner: { partnerId: 'demo', tenantId: 'tenant-a' } as never, manifestDigest: '', reviewerKeyId: '', signatureBase64: '' }, manifest: new Uint8Array(), documents: [], policies: [], observedAt: '2026-10-08T12:00:00.000Z' })
  assert.equal(result.eligibleForIndependentLegalReview, false)
  assert.equal(result.authorizesProduction, false)
})
