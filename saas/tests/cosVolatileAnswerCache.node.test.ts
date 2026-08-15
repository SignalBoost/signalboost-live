import assert from 'node:assert/strict'
import test from 'node:test'
import { MemoryExactCacheStore } from '../lib/cos-core/layers/exact-cache/index.ts'
import {
  COS_VOLATILE_CACHE_POLICY_VERSION,
  readVolatileAnswerCache,
  volatileAnswerCacheKey,
  volatileAnswerCacheTtlMs,
  writeVolatileAnswerCache,
} from '../lib/ai/cos/cosVolatileAnswerCache.ts'

const value = {
  reply: 'Example current answer.',
  groundedAt: '2026-08-15T13:30:00.000Z',
  liveSources: [{
    id: 'LIVE1',
    title: 'Example source',
    url: 'https://example.gov/current',
    snippet: 'Example current evidence.',
  }],
  externalProvider: null,
  externalModel: null,
}

test('retired volatile cache namespace remains deterministic and language-scoped', () => {
  const a = volatileAnswerCacheKey({ prompt: 'Who is the CURRENT President? ', language: 'en' })
  const b = volatileAnswerCacheKey({ prompt: ' who   is the current president? ', language: 'EN' })
  const c = volatileAnswerCacheKey({ prompt: 'Who is the current President?', language: 'pt' })
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.match(COS_VOLATILE_CACHE_POLICY_VERSION, /no-replay/)
})

test('volatile current-fact answer TTL is disabled', () => {
  assert.equal(volatileAnswerCacheTtlMs(undefined), 0)
  assert.equal(volatileAnswerCacheTtlMs('3600000'), 0)
})

test('current-fact answers cannot be written or replayed across requests', async () => {
  const store = new MemoryExactCacheStore()
  const now = Date.now()

  assert.equal(await writeVolatileAnswerCache({
    prompt: 'Who is the current President?',
    language: 'en',
    value,
    store,
    now,
    ttlMs: 60_000,
  }), false)

  const hit = await readVolatileAnswerCache({
    prompt: 'WHO IS THE CURRENT PRESIDENT?',
    language: 'en',
    store,
    now: now + 1_000,
  })
  assert.equal(hit, null)
})
