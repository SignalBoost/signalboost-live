import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration'

test('complete provenance reports every required component and separates retrieved from cited', () => {
  const provenance = authoritativeProvenance({
    confidence: 0.85,
    provenance: {
      responseSource: 'local_cos_reasoning',
      localModelInvoked: true,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      knowledgeFactsUsed: 3,
      knowledgeFactsCited: 0,
      learnedItemsUsed: 12,
      learnedItemsCited: 2,
      userMemoriesUsed: 0,
      userMemoriesCited: 0,
    },
  }, { invoked: false })

  const formatted = formatAuthoritativeProvenance(provenance, 'en')
  for (const label of [
    'Semantic Cache',
    'Enterprise Memory',
    'Knowledge Graph',
    'Learned Corpus',
    'User Memory',
    'Autonomous Research',
    'Local Reasoning Engine',
    'External AI Provider',
    'COS Confidence',
  ]) assert.ok(formatted.includes(label), `missing ${label}`)

  assert.match(formatted, /Learned Corpus\s+: USED — 2 cited of 12 retrieved learned items/)
  assert.match(formatted, /Knowledge Graph\s+: NOT USED — 0 cited of 3 retrieved graph-backed facts/)
  assert.match(formatted, /External AI Provider\s+: NOT INVOKED/)
  assert.match(formatted, /COS Confidence\s+: 0\.85 — threshold 0\.72/)
})
