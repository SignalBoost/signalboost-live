import assert from 'node:assert/strict'
import test from 'node:test'
import { mustFailClosedWithoutAuthoritativeLiveEvidence } from '../lib/ai/cos/liveEvidenceFailClosed.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('stable civic lookups still request live evidence, but may use the local reasoner if search returns nothing', () => {
  assert.equal(requiresFreshExternalEvidence('What is the capital of France?'), true)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('What is the capital of France?'), false)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('What is the capital of Kazakhstan?'), false)
})

test('owned official series and volatile public state still fail closed on a live miss', () => {
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('is there a pay gap btw women and men in the US?'), true)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('do median weekly earnings differ between men and women in the US?'), true)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('Who is the current President of the United States?'), true)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('What is the TSLA stock price?'), true)
  assert.equal(mustFailClosedWithoutAuthoritativeLiveEvidence('What are the current GDPR breach notification requirements?'), true)
})
