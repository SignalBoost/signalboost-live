// saas/tests/learnedEvidencePolicy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { learnedEvidenceUseRequired } from '../lib/ai/cos/learnedEvidencePolicy.ts'

const LEARNED_WITH_CONTENT = ['[CL1] (retrieved content) Enterprise networking rollout transcript …']
const LEARNED_METADATA_ONLY = ['[CL1] video metadata pointer, no retrieved body']

test('the exact production failure shape is exempt: an email edit never owes a corpus citation', () => {
  const prompt = 'edit - Dear AskISSO, We in Paramaribo had the Enterprise Wi Fi installed a few months ago but we are still wafting for it to be actived, how or who could give us info about the status of the activation. We appreciate any info you may have on this.  Thank you.'
  assert.equal(learnedEvidenceUseRequired(prompt, LEARNED_WITH_CONTENT), false)
})

test('script and draft requests are exempt too', () => {
  for (const prompt of [
    'Write a script that is humorous but also strictly professional, avoids slang, uses short sentences, and maintains compliance tone.',
    'summarize this text for a customer update',
    'translate this paragraph to Spanish',
  ]) {
    assert.equal(learnedEvidenceUseRequired(prompt, LEARNED_WITH_CONTENT), false, prompt)
  }
})

test('knowledge answers with retrieved full-content evidence still owe a citation', () => {
  assert.equal(learnedEvidenceUseRequired('What are the main causes of enterprise Wi-Fi activation delays?', LEARNED_WITH_CONTENT), true)
  assert.equal(learnedEvidenceUseRequired('Explain the difference between Enterprise Memory and Semantic Cache.', LEARNED_WITH_CONTENT), true)
})

test('metadata-only learned context never requires citation, for any prompt', () => {
  assert.equal(learnedEvidenceUseRequired('What are the main causes of enterprise Wi-Fi activation delays?', LEARNED_METADATA_ONLY), false)
  assert.equal(learnedEvidenceUseRequired('edit - this email please', []), false)
})
