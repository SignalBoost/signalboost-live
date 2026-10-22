import { prefixCacheStats } from '../lib/ai/usage.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const helper = readFileSync(new URL('../lib/ai/usage.ts', import.meta.url), 'utf8')
const support = readFileSync(new URL('../app/api/support/routeCore.ts', import.meta.url), 'utf8')

test('prefix cache stats distinguish Anthropic cache reads and writes', () => {
  assert.match(helper, /cache_creation_input_tokens/)
  assert.match(helper, /cache_read_input_tokens/)
  assert.match(helper, /nonnegative\(usage\.input_tokens\) \+ cacheReadTokens \+ cacheWriteTokens/)
  assert.match(helper, /cacheReadTokens: boundedRead/)
})

test('OpenAI cached tokens are included in prompt tokens, not counted twice', () => {
  assert.match(helper, /openAi \? nonnegative\(usage\.prompt_tokens \?\? usage\.input_tokens\)/)
  assert.match(helper, /usage\.prompt_tokens_details\?\.cached_tokens/)
  assert.match(helper, /usage\.input_tokens_details\?\.cached_tokens/)
  assert.match(helper, /Math\.min\(inputTokens, cacheReadTokens\)/)
})

test('telemetry is opt-in and records only aggregate counts, never prompt text', () => {
  assert.match(support, /COS_PREFIX_CACHE_METRICS === '1'/)
  assert.match(support, /prefixCacheStats\(\(msg as any\)\.usage\)/)
  assert.match(support, /cacheReadTokens: cache\.cacheReadTokens/)
  assert.match(support, /cacheWriteTokens: cache\.cacheWriteTokens/)
  assert.match(support, /hitRate: cache\.hitRate/)
})

test('Anthropic usage counts cache read/write input once', () => {
  assert.deepEqual(prefixCacheStats({ input_tokens: 100, cache_creation_input_tokens: 50, cache_read_input_tokens: 250 }), {
    inputTokens: 400, cacheReadTokens: 250, cacheWriteTokens: 50, hitRate: 0.625,
  })
})
test('OpenAI Chat Completions usage does not double-count cached prompt tokens', () => {
  assert.deepEqual(prefixCacheStats({ prompt_tokens: 800, prompt_tokens_details: { cached_tokens: 600 } }), {
    inputTokens: 800, cacheReadTokens: 600, cacheWriteTokens: 0, hitRate: 0.75,
  })
})
test('OpenAI Responses usage supports input_tokens_details', () => {
  assert.deepEqual(prefixCacheStats({ input_tokens: 400, input_tokens_details: { cached_tokens: 100 } }), {
    inputTokens: 400, cacheReadTokens: 100, cacheWriteTokens: 0, hitRate: 0.25,
  })
})
test('invalid token values fail closed and cache hit rate remains bounded', () => {
  assert.deepEqual(prefixCacheStats({ prompt_tokens: 5, prompt_tokens_details: { cached_tokens: 40 } }), {
    inputTokens: 5, cacheReadTokens: 5, cacheWriteTokens: 0, hitRate: 1,
  })
  assert.deepEqual(prefixCacheStats(null), { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, hitRate: 0 })
})
