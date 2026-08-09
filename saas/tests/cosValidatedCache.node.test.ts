import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = async (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('COS text gateway validates durable hits and provider output before caching', async () => {
  const gateway = await read('../lib/cos/textGateway.ts')

  assert.match(gateway, /cacheValidator/)
  assert.match(gateway, /passesCacheValidation\(input, stored\.text\)/)
  assert.match(gateway, /delete\(\)\.eq\('cache_key', key\)/)
  assert.match(gateway, /text && db && passesCacheValidation\(input, text\)/)
})

test('generated-content translation validates segment structure before COS caches it', async () => {
  const translation = await read('../lib/i18n/contentTranslation.ts')

  assert.match(translation, /isValidTranslationResponse/)
  assert.match(translation, /translatedRows\.length !== sourceSegments\.length/)
  assert.match(translation, /cacheValidator: \(text\) => isValidTranslationResponse\(text, segments\)/)
})

test('COS text gateway records live ROI for cache hits, in-flight reuse, and provider execution', async () => {
  const gateway = await read('../lib/cos/textGateway.ts')

  assert.match(gateway, /COS_BASELINE_TEXT_CALL_COST_USD/)
  assert.match(gateway, /cos_ai_roi_metrics/)
  assert.match(gateway, /'exact_cache'/)
  assert.match(gateway, /'in_flight'/)
  assert.match(gateway, /'reasoning'/)
  assert.match(gateway, /estimated_cost_avoided_usd/)
  assert.match(gateway, /provider_calls: source === 'reasoning' \? 1 : 0/)
})
