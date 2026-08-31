import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('normative organized-sport eligibility routes through live evidence before current policy claims', () => {
  for (const prompt of [
    "should men play in women' sport?",
    'Should this athlete be allowed to compete in the women’s category?',
    'Can this group participate in the female sports division?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('ordinary timeless personal advice is not converted into a live lookup', () => {
  assert.equal(requiresFreshExternalEvidence('should children play outside more often?'), false)
  assert.equal(requiresFreshExternalEvidence('how should I market my latest product?'), false)
})
