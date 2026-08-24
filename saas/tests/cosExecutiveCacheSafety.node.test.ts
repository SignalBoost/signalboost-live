import assert from 'node:assert/strict'
import test from 'node:test'
import { semanticCacheAllowedForPrompt } from '../lib/ai/cos/cacheSafetyPolicy.ts'
import { COS_ANSWER_GATE_REVISION } from '../lib/ai/cos/cosAnswerPolicy.ts'

test('executive SaaS arbitration never replays a cached memo', () => {
  const prompt = 'The company is launching a self-serve SaaS tier. Enterprise Sales warns contracted renewals could downgrade while Product says hobbling harms PLG. Design the arbitration memo and rollout framework for executive alignment.'
  assert.equal(semanticCacheAllowedForPrompt(prompt), false)
})
test('ordinary conceptual questions remain cacheable', () => {
  assert.equal(semanticCacheAllowedForPrompt('What is the difference between Enterprise Memory and Semantic Cache?'), true)
})
test('policy revision invalidates answers written before the executive guard', () => {
  assert.match(COS_ANSWER_GATE_REVISION, /executive-claim-guard/)
})
