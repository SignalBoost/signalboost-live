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
      userMemoriesUsed: 5,
      localModelInvoked: true,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
    },
  }, { invoked: false })

  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(text, /Semantic Cache\s+: NOT USED/)
  assert.match(text, /Enterprise Memory\s+: NOT USED/)
  assert.match(text, /Knowledge Graph\s+: NOT USED/)
  assert.match(text, /Learned Corpus\s+: USED — 12 learned items contributed/)
  assert.match(text, /Autonomous Research\s+: NOT USED/)
  assert.match(text, /Local Reasoning Engine:\s+INVOKED — independent-local:qwen2\.5-coder:32b/)
  assert.match(text, /External AI Provider\s+: NOT INVOKED/)
  assert.match(text, /COS Confidence\s+: 0\.65 — threshold 0\.72/)
})
