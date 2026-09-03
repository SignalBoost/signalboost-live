import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlatformSelfKnowledgePrompt, requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('direct model identity wording is routed as platform self-knowledge', () => {
  for (const prompt of [
    'what is your model',
    'what is your model?',
    'what model are you',
    'what model do you use?',
    'which model do you use?',
  ]) {
    assert.equal(isPlatformSelfKnowledgePrompt(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('ordinary model questions are not mistaken for COS self-identity', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('what is the best model for weather forecasting?'), false)
})
