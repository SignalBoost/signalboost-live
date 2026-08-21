import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'

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
    'Answer Origin',
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

  assert.match(formatted, /Answer Origin\s+: FRESH — generated during this request/)
  assert.match(formatted, /Learned Corpus\s+: USED — 20 retrieved → 20 relevant → 6 selected → 6 injected → 2 cited/)
  assert.match(formatted, /Knowledge Graph: 32 retrieved → 7 relevant → 4 selected → 4 injected → 0 cited/)
  assert.match(formatted, /User Memory: 15 retrieved → 0 relevant → 0 selected → 0 injected → 0 cited/)
  assert.match(formatted, /Local Reasoning Engine\s+: INVOKED — independent-local:qwen2\.5-coder:32b/)
  assert.match(formatted, /External AI Provider: NOT USED/)
  assert.match(formatted, /COS Confidence\s+: 0\.85 — threshold 0\.72/)
  assert.equal(provenance.schema_version, 4)
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
        knowledgeGraph: { retrieved: 18, relevant: 3, selected: 3, injected: 3, cited: 1 },
        learnedCorpus: { retrieved: 9, relevant: 9, selected: 2, injected: 2, cited: 2 },
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
  assert.match(formatted, /Answer Origin\s+: CACHE — written 2026-08-12T12:00:00\.000Z by independent-local:qwen2\.5-coder:32b/)
  assert.match(formatted, /Original Lineage/)
  assert.match(formatted, /Local Reasoning Engine\s+: INVOKED — independent-local:qwen2\.5-coder:32b/)
  assert.match(formatted, /Learned Corpus\s+: 12 retrieved → 12 relevant → 6 selected → 6 injected → 2 cited/)
  assert.match(formatted, /Knowledge Graph\s+: 24 retrieved → 5 relevant → 4 selected → 4 injected → 1 cited/)
  assert.match(formatted, /Current Retrieval Attempt/)
  assert.match(formatted, /Knowledge Graph\s+: 18 retrieved → 3 relevant → 3 selected → 0 injected — NOT INJECTED into the cached answer/)
  assert.match(formatted, /Learned Corpus\s+: 9 retrieved → 9 relevant → 2 selected → 0 injected — NOT INJECTED into the cached answer/)
  assert.match(formatted, /COS Confidence\s+: 0\.90 — threshold 0\.72 \(based on original lineage\)/)
  assert.equal(provenance.knowledge_graph.injected_count, 0)
  assert.equal(provenance.learned_corpus.injected_count, 0)
  assert.equal(provenance.answer_origin.evidence_funnel?.knowledgeGraph.injected, 4)
  assert.equal(provenance.answer_origin.evidence_funnel?.learnedCorpus.injected, 6)
  assert.equal(provenance.answer_origin.model, 'independent-local:qwen2.5-coder:32b')
})

test('fresh-evidence provenance delegates provider identity to the canonical reasoner resolver', () => {
  const freshSynthesis = readFileSync(new URL('../lib/ai/cos/freshEvidenceLocalSynthesis.ts', import.meta.url), 'utf8')
  const primaryRoute = readFileSync(new URL('../app/api/cos-primary/baseRoute.ts', import.meta.url), 'utf8')

  assert.match(freshSynthesis, /resolveCosReasoner/)
  assert.doesNotMatch(freshSynthesis, /reasonerLabel:\s*`independent-local:/)
  assert.match(primaryRoute, /function localReasonerLabel\(\):string\{const resolved=resolveCosReasoner\(\)/)
  assert.doesNotMatch(primaryRoute, /function localReasonerLabel\(\):string\{return`independent-local:/)
})
