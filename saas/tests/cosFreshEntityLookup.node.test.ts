import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('simple named-person identity lookup uses fresh reference evidence', () => {
  assert.equal(requiresFreshExternalEvidence('who is Hayden Panettiere?'), true)
  assert.equal(requiresFreshExternalEvidence('Who is Hulk Hogan?'), true)
  assert.equal(requiresFreshExternalEvidence('who is ada lovelace?'), true)
})

test('identity grounding does not hijack private or conceptual who questions', () => {
  assert.equal(requiresFreshExternalEvidence('who is my account manager?'), false)
  assert.equal(requiresFreshExternalEvidence('who is the current president of the United States?'), true)
  assert.equal(requiresFreshExternalEvidence('Explain who is responsible for transaction isolation.'), false)
})
