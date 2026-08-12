// saas/tests/cosEvidenceRanking.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { evidenceTerms, rankEvidence } from '../lib/ai/cos/evidenceRanking'
import { evidenceConfidenceCeiling, rerankRetrievedEvidence } from '../lib/ai/cos/rerankRetrievedEvidence'

const safeText = (value: unknown, max = 1200): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

test('evidence tokenizer preserves supported Cyrillic text', () => {
  const tokens = evidenceTerms('Почему задержка API выросла только для крупных клиентов?')
  assert.ok(tokens.includes('задержка'))
  assert.ok(tokens.includes('крупных'))
})

test('ranker rejects high-confidence evidence that is topically irrelevant', () => {
  const ranked = rankEvidence('enterprise tenant API latency connection pool waits', [
    { id:'CL1', text:'Periviable breech delivery decision-making under evidence uncertainty', confidence:.99, source:'journal' },
    { id:'CL2', text:'Enterprise tenant API latency can rise when connection pool queue waits increase', confidence:.80, source:'sre' },
  ], 8)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0]?.id, 'CL2')
})

test('reranking labels each evidence store and drops unrelated learned material', () => {
  const result = rerankRetrievedEvidence(
    'robot tactile manipulation grip slip force spatial control',
    [{ subject:'robot manipulation', predicate:'observable', object:'tactile slip force and end-effector pose', confidence:.9, source:'kg' }],
    [
      { subject:'robotic manipulation', summary:'GelTip tactile sensor supports dexterous manipulation and contact sensing', facts:[], confidence:.82, source_kind:'scientific_journal', source_uri:'doi:test' },
      { subject:'economics', summary:'Bayesian adaptive economic planning under uncertainty', facts:[], confidence:.99, source_kind:'scientific_journal', source_uri:'doi:irrelevant' },
    ],
    [{kind:'preference',content:'robot tactile manipulation testing uses force observables'}],
    safeText,
  )
  assert.ok(result.facts[0]?.startsWith('[KG1]'))
  assert.ok(result.learned.some(item => item.startsWith('[CL1]')))
  assert.ok(!result.learned.some(item => item.includes('economic planning')))
  assert.ok(result.memories[0]?.startsWith('[EM1]'))
  assert.match(result.sourceBlock, /\[KG1\] Knowledge Graph/)
  assert.match(result.sourceBlock, /\[CL1\] Learned Corpus/)
  assert.match(result.sourceBlock, /\[EM1\] Enterprise Memory/)
})

test('reasoner source block globally prioritizes the strongest evidence', () => {
  const result = rerankRetrievedEvidence(
    'enterprise tenant API latency connection pool waits',
    [{ subject:'enterprise tenant API latency', predicate:'observable', object:'connection pool acquisition wait and database lock wait by tenant', confidence:.95, source:'incident-recipe' }],
    [{ subject:'API latency', summary:'Enterprise tenant connection pool queue waits can raise p95 without aggregate CPU saturation', facts:[], confidence:.88, source_kind:'learned_recipe', source_uri:'local:test' }],
    [{kind:'note',content:'enterprise tenant API latency investigation compares connection pool waits'}],
    safeText,
  )
  const first = result.sourceBlock.split('\n')[0]
  assert.match(first, /^\[1\] \[(KG|CL|EM)\d+\]/)
  assert.ok(result.sourceBlock.includes('relevance'))
  assert.ok(result.sourceBlock.includes('Source:'))
})

test('evidence ceiling rewards relevant evidence rather than raw retrieval count', () => {
  assert.equal(evidenceConfidenceCeiling({evidenceCount:12,highRelevanceCount:0,meanRelevance:.15}), .78)
  assert.equal(evidenceConfidenceCeiling({evidenceCount:3,highRelevanceCount:2,meanRelevance:.38}), .90)
  assert.equal(evidenceConfidenceCeiling({evidenceCount:7,highRelevanceCount:5,meanRelevance:.45}), .96)
})
