import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveLabFailureAttribution } from '../lib/ai/cos/cosLabFailureAttribution.ts'

const verified = { verifierId: 'independent-evaluator', evidenceRef: 'evidence://run/123', evidenceHash: 'a'.repeat(64), independentlyVerified: true } as const

test('provider error by itself never establishes platform fault', () => {
  assert.equal(resolveLabFailureAttribution({ providerStage: 'ERROR' }), 'UNATTRIBUTED')
  assert.equal(resolveLabFailureAttribution({ providerStage: 'ERROR', verification: { ...verified, verdict: 'PLATFORM_FAILURE', independentlyVerified: false } }), 'UNATTRIBUTED')
})
test('missing evidence, verifier or malformed hash fails closed', () => {
  assert.equal(resolveLabFailureAttribution({ providerStage: 'ERROR', verification: { ...verified, verdict: 'PLATFORM_FAILURE', evidenceHash: 'bad' } }), 'UNATTRIBUTED')
  assert.equal(resolveLabFailureAttribution({ providerStage: 'ERROR', verification: { ...verified, verdict: 'PLATFORM_FAILURE', verifierId: '' } }), 'UNATTRIBUTED')
})
test('verified verdicts are distinguishable and completed jobs do not imply competency', () => {
  for (const verdict of ['COMPETENCY_FAILURE', 'CUSTOMER_INFRA_FAILURE', 'PLATFORM_FAILURE'] as const) {
    assert.equal(resolveLabFailureAttribution({ providerStage: 'ERROR', verification: { ...verified, verdict } }), verdict)
  }
  assert.equal(resolveLabFailureAttribution({ providerStage: 'COMPLETED', verification: { ...verified, verdict: 'PLATFORM_FAILURE' } }), 'UNATTRIBUTED')
})
