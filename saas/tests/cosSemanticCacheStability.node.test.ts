import assert from 'node:assert/strict'
import test from 'node:test'
import { KnowledgeLayer, canonicalizeSemanticCacheContext, type KnowledgeRecord } from '../lib/cos-core/layers/knowledge/index.ts'

test('semantic cache identity ignores volatile retrieval scores but preserves evidence changes', () => {
  const first = [
    '[KG1] tenant latency — mechanism — plan shift [confidence 0.90; similarity 0.71; source internal]',
    '[CL1] queue diagnosis [confidence 0.88; relevance 0.63; runbook internal]',
    '[SK1] Diagnose tenant tail latency [status validated; relevance 0.82; procedural guidance only, not factual evidence]',
  ].join('\n')
  const sameEvidenceNewScores = [
    '[KG1] tenant latency — mechanism — plan shift [confidence 0.90; similarity 0.79; source internal]',
    '[CL1] queue diagnosis [confidence 0.88; relevance 0.70; runbook internal]',
    '[SK1] Diagnose tenant tail latency [status validated; relevance 0.91; procedural guidance only, not factual evidence]',
  ].join('\n')
  const changedEvidence = sameEvidenceNewScores.replace('plan shift', 'cache-thrash shift')

  assert.equal(canonicalizeSemanticCacheContext(first), canonicalizeSemanticCacheContext(sameEvidenceNewScores))
  assert.notEqual(canonicalizeSemanticCacheContext(first), canonicalizeSemanticCacheContext(changedEvidence))
})

test('semantic cache lookup and write embed the same canonical context for an identical prompt', async () => {
  const embeddingInputs: string[] = []
  const saved: KnowledgeRecord[] = []
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async (text) => { embeddingInputs.push(text); return [1, 0] },
    store: {
      queryNearest: async () => null,
      save: async (record) => { saved.push(record) },
    },
  })

  const prompt = 'diagnose the enterprise-only latency regression'
  await knowledge.lookupSemanticCache('cos-first-answer@policy', prompt, '[SK1] Diagnose latency [status validated; relevance 0.71; procedural guidance only]')
  await knowledge.commitToMemory('cos-first-answer@policy', prompt, '[SK1] Diagnose latency [status validated; relevance 0.88; procedural guidance only]', { reply: 'cached' })

  assert.equal(embeddingInputs.length, 2)
  assert.equal(embeddingInputs[0], embeddingInputs[1])
  assert.equal(saved.length, 1)
  assert.doesNotMatch(saved[0].contextText, /relevance\s+0\./i)
})

test('identical prompt and material context hit before embedding even when ranking scores changed', async () => {
  let embeddings = 0
  let nearestCalls = 0
  const cached = { reply: 'cached answer', origin: { userMemoriesUsed: 0 } }
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => { embeddings += 1; return [1, 0] },
    store: {
      queryExact: async () => ({
        taskId: 'cos-first-answer@policy',
        originalPrompt: 'same prompt',
        contextText: '[SK1] Diagnose latency [status validated; relevance 0.71; procedural guidance only]',
        responsePayload: cached,
        similarityScore: 1,
      }),
      queryNearest: async () => { nearestCalls += 1; return null },
      save: async () => {},
    },
  })

  const hit = await knowledge.lookupSemanticCache(
    'cos-first-answer@policy',
    'same prompt',
    '[SK1] Diagnose latency [status validated; relevance 0.89; procedural guidance only]',
  )

  assert.ok(hit)
  assert.equal(hit!.responsePayload, cached)
  assert.equal(hit!.similarityScore, 1)
  assert.equal(embeddings, 0)
  assert.equal(nearestCalls, 0)
})

test('exact prompt does not bypass a material context change', async () => {
  let embeddings = 0
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => { embeddings += 1; return [1, 0] },
    store: {
      queryExact: async () => ({
        taskId: 'cos-first-answer@policy',
        originalPrompt: 'same prompt',
        contextText: '[KG1] tenant latency — mechanism — plan shift [confidence 0.90; similarity 0.71; source internal]',
        responsePayload: { reply: 'old' },
        similarityScore: 1,
      }),
      queryNearest: async () => null,
      save: async () => {},
    },
  })

  const hit = await knowledge.lookupSemanticCache(
    'cos-first-answer@policy',
    'same prompt',
    '[KG1] tenant latency — mechanism — cache-thrash shift [confidence 0.90; similarity 0.71; source internal]',
  )

  assert.equal(hit, null)
  assert.equal(embeddings, 1)
})
