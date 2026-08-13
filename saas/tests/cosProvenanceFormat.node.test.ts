import assert from 'node:assert/strict'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration'

test('complete provenance reports retrieved, relevant, selected, injected and cited stages', () => {
  const provenance = authoritativeProvenance({
    confidence: 0.85,
    provenance: {
      responseSource: 'local_cos_reasoning',
      localModelInvoked: true,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      knowledgeFactsUsed: 4,
      knowledgeFactsCited: 0,
      learnedItemsUsed: 6,
      learnedItemsCited: 2,
      userMemoriesUsed: 0,
      userMemoriesCited: 0,
      evidenceFunnel: {
        knowledgeGraph: { retrieved: 32, relevant: 7, selected: 4, injected: 4, cited: 0 },
        learnedCorpus: { retrieved: 20, relevant: 20, selected: 6, injected: 6, cited: 2 },
        userMemory: { retrieved: 15, relevant: 0, selected: 0, injected: 0, cited: 0 },
      },
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

  assert.match(formatted, /Learned Corpus\s+: USED — 20 retrieved → 20 relevant → 6 selected → 6 injected → 2 cited learned items/)
  assert.match(formatted, /Knowledge Graph\s+: NOT USED — 32 retrieved → 7 relevant → 4 selected → 4 injected → 0 cited graph-backed facts/)
  assert.match(formatted, /User Memory\s+: NOT USED — 15 retrieved → 0 relevant → 0 selected → 0 injected → 0 cited saved memories/)
  assert.match(formatted, /Local Reasoning Engine: INVOKED — independent-local:qwen2\.5-coder:32b/)
  assert.match(formatted, /External AI Provider\s+: NOT INVOKED/)
  assert.match(formatted, /COS Confidence\s+: 0\.85 — threshold 0\.72/)
  assert.equal(provenance.schema_version, 2)
})

test('cache-hit provenance separates current retrieval from the turn that generated the answer', () => {
  const provenance = authoritativeProvenance({
    confidence: 0.9,
    provenance: {
      responseSource: 'semantic_similarity',
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      localModelInvoked: false,
      knowledgeFactsUsed: 4,
      knowledgeFactsCited: 1,
      learnedItemsUsed: 6,
      learnedItemsCited: 2,
      userMemoriesUsed: 0,
      userMemoriesCited: 0,
      evidenceFunnel: {
        knowledgeGraph: { retrieved: 18, relevant: 3, selected: 3, injected: 0, cited: 0 },
        learnedCorpus: { retrieved: 9, relevant: 9, selected: 2, injected: 0, cited: 0 },
        userMemory: { retrieved: 4, relevant: 0, selected: 0, injected: 0, cited: 0 },
      },
      cacheOrigin: {
        storedAt: '2026-08-12T12:00:00.000Z',
        policyVersion: 'policy-abc',
        retrievedThisTurn: { facts: 18, learned: 9, memories: 4 },
        originEvidenceFunnel: {
          knowledgeGraph: { retrieved: 24, relevant: 5, selected: 4, injected: 4, cited: 1 },
          learnedCorpus: { retrieved: 12, relevant: 12, selected: 6, injected: 6, cited: 2 },
          userMemory: { retrieved: 8, relevant: 0, selected: 0, injected: 0, cited: 0 },
        },
      },
    },
  }, { invoked: false })

  const formatted = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(formatted, /Answer Origin\s+: SERVED FROM CACHE/)
  assert.match(formatted, /Origin Evidence\s+: KG 4 injected\/1 cited; corpus 6 injected\/2 cited; memory 0 injected\/0 cited/)
  assert.match(formatted, /Semantic Cache\s+: USED/)
  assert.match(formatted, /Knowledge Graph\s+: NOT USED — 18 retrieved → 3 relevant → 3 selected → 0 injected → 0 cited/)
  assert.match(formatted, /Learned Corpus\s+: NOT USED — 9 retrieved → 9 relevant → 2 selected → 0 injected → 0 cited/)
  assert.match(formatted, /Local Reasoning Engine: NOT INVOKED\./)
  assert.match(formatted, /Recorded when the cached answer was generated; no confidence gate ran on this request/)
  assert.equal(provenance.answer_origin.model, 'independent-local:qwen2.5-coder:32b')
})
