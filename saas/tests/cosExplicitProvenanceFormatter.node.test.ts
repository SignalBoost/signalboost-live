import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration'

test('provenance formatter always names every subsystem and does not equate retrieval with use', () => {
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
      evidenceFunnel: {
        knowledgeGraph: { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 },
        learnedCorpus: { retrieved: 18, relevant: 18, selected: 12, injected: 12, cited: 0 },
        userMemory: { retrieved: 20, relevant: 5, selected: 5, injected: 5, cited: 0 },
      },
    },
  }, { invoked: false })

  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(text, /Semantic Cache\s+: NOT USED/)
  assert.match(text, /Enterprise Memory\s+: NOT USED/)
  assert.match(text, /Knowledge Graph\s+: NOT USED/)
  assert.match(text, /Learned Corpus\s+: NOT USED — 18 retrieved → 18 relevant → 12 selected → 12 injected → 0 cited/)
  assert.match(text, /User Memory\s+: NOT USED — 20 retrieved → 5 relevant → 5 selected → 5 injected → 0 cited/)
  assert.match(text, /Autonomous Research\s+: NOT USED/)
  assert.match(text, /Local Reasoning Engine: INVOKED — independent-local:qwen2\.5-coder:32b/)
  assert.match(text, /External AI Provider\s+: NOT INVOKED/)
  assert.match(text, /COS Confidence\s+: 0\.65 — threshold 0\.72/)
})
