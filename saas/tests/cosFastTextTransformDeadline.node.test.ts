import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('../app/api/cos-primary/route.ts', import.meta.url)

test('fast text transforms keep a realistic bounded local deadline', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /FAST_TEXT_TRANSFORM_TIMEOUT_MS\s*=\s*35_000/)
  assert.match(source, /timeoutMs:FAST_TEXT_TRANSFORM_TIMEOUT_MS/)
  assert.match(source, /Math\.min\(config\.timeoutMs,FAST_TEXT_TRANSFORM_TIMEOUT_MS\)/)
  assert.match(source, /disableThinking:true/)
  assert.match(source, /allowConfiguredFallback:false/)
  assert.match(source, /persistUsage:false/)
  assert.doesNotMatch(source, /12-second fast-path limit/)
})
