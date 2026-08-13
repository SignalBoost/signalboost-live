//
// THIS TEST WAS ASSERTING THE OLD LIE. It required "Learned Corpus: USED — 12 learned items
// contributed" for an answer that cited none of them — the exact overstatement the
// retrieved-vs-cited work removed. It sits outside package.json's test script, so nothing
// caught that it had been wrong ever since. Rewritten to pin the honest wording.

import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration'

test('provenance formatter always names every requested subsystem and external AI state', () => {
  const provenance = authoritativeProvenance({
    confidence: 0.65,
    provenance: {
      responseSource: 'local_cos_reasoning',
      knowledgeFactsUsed: 0,
      learnedItemsUsed: 12,
      learnedItemsCited: 0,
      userMemoriesUsed: 5,
      userMemoriesCited: 0,
      localModelInvoked: true,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
    },
  }, { invoked: false })

  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(text, /Semantic Cache\s+: NOT USED/)
  assert.match(text, /Enterprise Memory\s+: NOT USED/)
  assert.match(text, /Knowledge Graph\s+: NOT USED/)
  // Retrieved is not used. Twelve items reached the reasoner and none of them changed the answer.
  assert.match(text, /Learned Corpus\s+: NOT USED — 0 cited of 12 retrieved learned items/)
  assert.match(text, /User Memory\s+: NOT USED — 0 cited of 5 retrieved saved memories/)
  assert.match(text, /Autonomous Research\s+: NOT USED/)
  assert.match(text, /Local Reasoning Engine: INVOKED — independent-local:qwen2\.5-coder:32b/)
  assert.match(text, /External AI Provider\s+: NOT INVOKED/)
  assert.match(text, /COS Confidence\s+: 0\.65 — threshold 0\.72/)
})
