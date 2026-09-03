// saas/tests/ownerModelIdentityIntent.node.test.ts
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

// Owner production message, 2026-09-03: the trailing "/specs" broke the end-of-string anchor in
// DIRECT_MODEL_IDENTITY_ASK, so the owner's own configuration question missed the deterministic
// platform-stack reply and fell into the full reasoner pipeline instead.
test('compound and possessive spec phrasings are platform self-knowledge', () => {
  for (const prompt of [
    'what is your model/specs?',
    'what are your specs?',
    'what are your model specs?',
    'what model/specs do you use?',
    'tell me your specs',
    'what is your context window?',
    'what is your architecture and configuration?',
    'what hardware do you run on?',
    'what GPU are you running on?',
    'what provider hosts you?',
    '¿cuáles son tus especificaciones?',
    'jaka jest twoja specyfikacja?',
    'какая у вас модель?',
  ]) {
    assert.equal(isPlatformSelfKnowledgePrompt(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})

test('ordinary model questions are not mistaken for COS self-identity', () => {
  assert.equal(isPlatformSelfKnowledgePrompt('what is the best model for weather forecasting?'), false)
})

// The widened rule must not swallow external-product questions or authoring requests that merely
// mention the stack.
test('external spec questions and authoring requests keep their own routing', () => {
  for (const prompt of [
    'what are the specs of the iPhone 17?',
    'what hardware do you recommend for a render farm?',
    'write a blog post about your model',
    'draft an email describing our specs to the client',
    'summarize your notes from the meeting',
  ]) {
    assert.equal(isPlatformSelfKnowledgePrompt(prompt), false, prompt)
  }
})
