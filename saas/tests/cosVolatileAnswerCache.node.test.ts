import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryExactCacheStore } from '../lib/cos-core/layers/exact-cache/index.ts'
import {
  COS_VOLATILE_CACHE_POLICY_VERSION,
  readVolatileAnswerCache,
  volatileAnswerCacheKey,
  volatileAnswerCacheTtlMs,
  volatileCacheHitProvenance,
  writeVolatileAnswerCache,
} from '../lib/ai/cos/cosVolatileAnswerCache.ts'

const value = {
  reply: 'Donald Trump. [LIVE1] https://www.whitehouse.gov/administration/',
  groundedAt: '2026-08-15T13:30:00.000Z',
  liveSources: [{
    id: 'LIVE1',
    title: 'Official White House',
    url: 'https://www.whitehouse.gov/administration/',
    snippet: 'Donald J. Trump is the 47th President of the United States.',
  }],
  externalProvider: 'gemini',
  externalModel: 'gemini-3.6-flash',
}

test('volatile cache key is exact after harmless whitespace/case normalization and language-scoped', () => {
  const a = volatileAnswerCacheKey({ prompt: 'Who is the CURRENT President? ', language: 'en' })
  const b = volatileAnswerCacheKey({ prompt: ' who   is the current president? ', language: 'EN' })
  const c = volatileAnswerCacheKey({ prompt: 'Who is the current President?', language: 'pt' })
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('volatile cache defaults to one hour and clamps unsafe TTLs', () => {
  assert.equal(volatileAnswerCacheTtlMs(undefined), 60 * 60 * 1000)
  assert.equal(volatileAnswerCacheTtlMs('1'), 60 * 1000)
  assert.equal(volatileAnswerCacheTtlMs(String(48 * 60 * 60 * 1000)), 24 * 60 * 60 * 1000)
})

test('accepted grounded answer can be written and replayed without current-turn research or models', async () => {
  const store = new MemoryExactCacheStore()
  const now = Date.now()
  assert.equal(await writeVolatileAnswerCache({ prompt: 'Who is the current President?', language: 'en', value, store, now, ttlMs: 60_000 }), true)
  const hit = await readVolatileAnswerCache({ prompt: 'WHO IS THE CURRENT PRESIDENT?', language: 'en', store, now: now + 1_000 })
  assert.ok(hit)
  assert.equal(hit?.value.reply, value.reply)
  assert.equal(hit?.ttlRemainingMs, 59_000)

  const provenance = volatileCacheHitProvenance({
    schema_version: 4,
    semantic_cache: { used: false, evidence_count: 0 },
    autonomous_research: { used: false, documents_acquired: 0, new_knowledge_retained: 0 },
    local_reasoning: { invoked: false, model: null, confidence: null, threshold: 0.72 },
    external_ai: { invoked: false, provider: null, model: null },
  }, hit!)
  assert.equal(provenance.volatile_answer_cache.used, true)
  assert.equal(provenance.autonomous_research.used, false)
  assert.equal(provenance.local_reasoning.invoked, false)
  assert.equal(provenance.external_ai.invoked, false)
  assert.equal(provenance.answer_origin.policy_version, COS_VOLATILE_CACHE_POLICY_VERSION)
  assert.equal(provenance.answer_origin.live_evidence_sources[0].url, 'https://www.whitehouse.gov/administration/')
})
