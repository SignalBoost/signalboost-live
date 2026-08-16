import assert from 'node:assert/strict'
import test from 'node:test'
import { KnowledgeLayer, citedCacheContextStillCurrent } from '../lib/cos-core/layers/knowledge/index.ts'

const SKILL = '[SK1] Diagnose tenant tail latency [status validated; relevance 0.82; procedural guidance only, not factual evidence]'

test('uncited context growth does not invalidate unchanged cited skill', async () => {
  let embeddings = 0
  const cached = { reply: 'Use the diagnostic procedure [SK1].', origin: { userMemoriesUsed: 0 } }
  const stored = `[CL1] old uncited item [confidence 0.80; relevance 0.61]\n${SKILL}`
  const current = `[CL1] newer uncited item [confidence 0.91; relevance 0.74]\n[CL2] another uncited item [confidence 0.88; relevance 0.69]\n${SKILL.replace('0.82','0.93')}`
  assert.equal(citedCacheContextStillCurrent(cached, stored, current), true)

  const layer = new KnowledgeLayer({
    generateEmbedding: async () => { embeddings += 1; return [1, 0] },
    store: {
      queryExact: async () => ({ taskId:'t', originalPrompt:'p', contextText:stored, responsePayload:cached, similarityScore:1 }),
      queryNearest: async () => null,
      save: async () => {},
    },
  })
  assert.ok(await layer.lookupSemanticCache('t','p',current))
  assert.equal(embeddings, 0)
})

test('changed cited skill invalidates repeated-answer reuse', async () => {
  let embeddings = 0
  const cached = { reply: 'Use [SK1].', origin: { userMemoriesUsed: 0 } }
  const changed = '[SK1] Diagnose tenant tail latency with a revised verification sequence [status validated; relevance 0.93; procedural guidance only, not factual evidence]'
  assert.equal(citedCacheContextStillCurrent(cached, SKILL, changed), false)

  const layer = new KnowledgeLayer({
    generateEmbedding: async () => { embeddings += 1; return [1, 0] },
    store: {
      queryExact: async () => ({ taskId:'t', originalPrompt:'p', contextText:SKILL, responsePayload:cached, similarityScore:1 }),
      queryNearest: async () => null,
      save: async () => {},
    },
  })
  assert.equal(await layer.lookupSemanticCache('t','p',changed), null)
  assert.equal(embeddings, 1)
})

test('missing cited evidence invalidates repeated-answer reuse', () => {
  const cached = { reply: 'Use [KG1] and [SK1].', origin: { userMemoriesUsed: 0 } }
  const stored = `[KG1] tenant latency — mechanism — plan shift [confidence 0.90; similarity 0.71; source internal]\n${SKILL}`
  assert.equal(citedCacheContextStillCurrent(cached, stored, SKILL), false)
})

test('nearest semantic reuse rejects a high-similarity answer whose cited fact changed', async () => {
  let embeddings = 0
  const cached = { reply: 'The supported limit is 100 [KG1].', origin: { userMemoriesUsed: 0 } }
  const stored = '[KG1] product — supported_limit — 100 [confidence 0.95; similarity 0.91; source official]'
  const current = '[KG1] product — supported_limit — 250 [confidence 0.99; similarity 0.96; source official]'

  const layer = new KnowledgeLayer({
    similarityThreshold: 0.93,
    generateEmbedding: async () => { embeddings += 1; return [1, 0] },
    store: {
      queryExact: async () => null,
      queryNearest: async () => ({ taskId:'t', originalPrompt:'similar older prompt', contextText:stored, responsePayload:cached, similarityScore:0.99 }),
      save: async () => {},
    },
  })

  assert.equal(await layer.lookupSemanticCache('t','new wording',current), null)
  assert.equal(embeddings, 1)
})

test('nearest semantic reuse may survive unrelated context growth when its cited evidence is unchanged', async () => {
  const cached = { reply: 'The supported limit is 100 [KG1].', origin: { userMemoriesUsed: 0 } }
  const stored = '[KG1] product — supported_limit — 100 [confidence 0.95; similarity 0.91; source official]'
  const current = `${stored.replace('similarity 0.91','similarity 0.99')}\n[CL1] unrelated new material [confidence 0.88; relevance 0.72]`

  const layer = new KnowledgeLayer({
    similarityThreshold: 0.93,
    generateEmbedding: async () => [1, 0],
    store: {
      queryExact: async () => null,
      queryNearest: async () => ({ taskId:'t', originalPrompt:'similar older prompt', contextText:stored, responsePayload:cached, similarityScore:0.99 }),
      save: async () => {},
    },
  })

  assert.ok(await layer.lookupSemanticCache('t','new wording',current))
})
