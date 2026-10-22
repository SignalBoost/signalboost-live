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
  assert.match(helper, /openAi \? nonnegative\(usage\.prompt_tokens\)/)
  assert.match(helper, /usage\.prompt_tokens_details\?\.cached_tokens/)
  assert.match(helper, /Math\.min\(inputTokens, cacheReadTokens\)/)
})

test('telemetry is opt-in and records only aggregate counts, never prompt text', () => {
  assert.match(support, /COS_PREFIX_CACHE_METRICS === '1'/)
  assert.match(support, /prefixCacheStats\(\(msg as any\)\.usage\)/)
  assert.match(support, /cacheReadTokens: cache\.cacheReadTokens/)
  assert.match(support, /cacheWriteTokens: cache\.cacheWriteTokens/)
  assert.match(support, /hitRate: cache\.hitRate/)
})
