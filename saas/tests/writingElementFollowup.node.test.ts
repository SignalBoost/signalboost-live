// saas/tests/writingElementFollowup.node.test.ts
//
// Production failure (2026-08-25): after COS edited an email, the follow-up "what would be the
// subject line for this email?" was routed to live evidence retrieval as a current-world lookup
// and failed closed. These tests pin that composition follow-ups about a document in the
// conversation are recognized as content generation in all five platform languages and never
// enter freshness routing — while genuine current-world lookups still do.

import assert from 'node:assert/strict'
import test from 'node:test'
import { isContentGenerationRequest, isWritingElementQuestion } from '../lib/ai/cos/contentGenerationIntent.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('the exact production subject-line follow-up is composition work, not a live lookup', () => {
  const question = 'what would be the subject line for this email?'
  assert.equal(isWritingElementQuestion(question), true)
  assert.equal(isContentGenerationRequest(question), true)
  assert.equal(requiresFreshExternalEvidence(question), false)
})

test('writing-element follow-ups are recognized across phrasings', () => {
  for (const question of [
    'give me a subject line for the email',
    'what should the title of this document be?',
    'suggest a closing for that letter',
    'what greeting should I use in this message?',
    'and a sign-off for the reply?',
  ]) {
    assert.equal(isContentGenerationRequest(question), true, question)
    assert.equal(requiresFreshExternalEvidence(question), false, question)
  }
})

test('all five platform languages route composition follow-ups away from freshness', () => {
  for (const question of [
    '¿cuál sería el asunto para este correo?',
    'qual seria o assunto para este e-mail?',
    'jaki byłby temat tej wiadomości?',
    'какая тема подойдёт для этого письма?',
  ]) {
    assert.equal(isContentGenerationRequest(question), true, question)
    assert.equal(requiresFreshExternalEvidence(question), false, question)
  }
})

test('a bare subject-line question with no artifact noun is still composition work', () => {
  for (const question of [
    'what the subject line should be?',
    'what should the subject line be?',
    'suggest a sign-off',
    '¿cuál sería la línea de asunto?',
    'qual seria a linha de assunto?',
  ]) {
    assert.equal(isWritingElementQuestion(question), true, question)
    assert.equal(requiresFreshExternalEvidence(question), false, question)
  }
})

test('genuine current-world lookups are untouched by the new exclusion', () => {
  for (const lookup of [
    'what is the population of Poland?',
    'who is the current president of Suriname?',
    'what is the price of AAPL stock?',
  ]) {
    assert.equal(isWritingElementQuestion(lookup), false, lookup)
    assert.equal(requiresFreshExternalEvidence(lookup), true, lookup)
  }
})

test('mentioning a title or subject without a conversation artifact does not trigger the exclusion', () => {
  assert.equal(isWritingElementQuestion('what is the title of the current UN Secretary-General?'), false)
  assert.equal(isWritingElementQuestion('what is the subject of the parliamentary hearing today?'), false)
})
