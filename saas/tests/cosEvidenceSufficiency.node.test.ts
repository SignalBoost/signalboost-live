import assert from 'node:assert/strict'
import test from 'node:test'
import { assessDelegatedEvidence } from '../lib/ai/cos/evidenceSufficiency.ts'

test('marks successful delegated evidence sufficient', () => {
  const result = assessDelegatedEvidence({ ok: true, mode: 'delegated', missingRequired: [], evidence: [
    { capabilityId: 'logs.search', result: { ok: true, providerId: 'logs', capabilityId: 'logs.search', data: { count: 2 } } },
  ] })
  assert.equal(result.sufficient, true)
  assert.equal(result.successful, 1)
})

test('marks missing required capability insufficient', () => {
  const result = assessDelegatedEvidence({ ok: false, mode: 'capability_unavailable', missingRequired: ['metrics.query'], evidence: [] })
  assert.equal(result.sufficient, false)
})

test('records failed connector capabilities', () => {
  const result = assessDelegatedEvidence({ ok: true, mode: 'delegated', missingRequired: [], evidence: [
    { capabilityId: 'logs.search', result: { ok: false, providerId: 'logs', capabilityId: 'logs.search', error: 'timeout' } },
  ] })
  assert.equal(result.sufficient, false)
  assert.deepEqual(result.failedCapabilities, ['logs.search'])
})
