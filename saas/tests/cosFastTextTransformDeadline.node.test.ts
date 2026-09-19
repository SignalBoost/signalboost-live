import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sourceUrl = new URL('../app/api/cos-primary/route.ts', import.meta.url)

test('canonical fast text transforms keep the bounded interactive deadline', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /FAST_TEXT_TRANSFORM_TIMEOUT_MS\s*=\s*18_000/)
  assert.match(source, /FAST_TEXT_TRANSFORM_ATTEMPT_MS\s*=\s*9_000/)
  assert.match(source, /const remaining=Math\.max\(0,FAST_TEXT_TRANSFORM_TIMEOUT_MS-\(Date\.now\(\)-startedAt\)\)/)
  assert.match(source, /const attemptMs=Math\.min\(FAST_TEXT_TRANSFORM_ATTEMPT_MS,remaining\)/)
  assert.match(source, /timeoutMs:attemptMs/)
  assert.match(source, /disableThinking:true/)
  assert.match(source, /allowConfiguredFallback:false/)
  assert.match(source, /persistUsage:false/)
  assert.match(source, /deepseek-ai\/DeepSeek-V4-Flash-0731/)
})
