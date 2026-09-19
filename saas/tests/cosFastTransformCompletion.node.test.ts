import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('foreground fast transforms use a bounded fast-model cascade off the saturated RunPod path', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(primary, /feature:'cos_fast_text_transform'/)
  assert.match(primary, /deepseek-ai\/DeepSeek-V4-Flash/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_ATTEMPT_MS = 9_000/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 18_000/)
  assert.match(primary, /for\(const model of models\)/)
})

test('Supabase access cannot hold a request for the full Vercel runtime', () => {
  const access = readFileSync(join(process.cwd(), 'lib/auth/access.ts'), 'utf8')
  assert.match(access, /ACCESS_AUTH_TIMEOUT_MS = 5_000/)
  assert.match(access, /Promise\.race\(\[/)
  assert.match(access, /\[auth-access-timeout\]/)
  assert.match(access, /return buildContext\(null, null, 'guest'\)/)
})

test('homepage Concierge and owner Assistant both enter the server fast-transform detector', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /pathname === '\/api\/concierge' \|\| pathname === '\/api\/cos-browser'/)
  assert.match(proxy, /if \(await fastTextTransformRequest\(req\)\)/)
  assert.match(proxy, /x-signalboost-fast-transform-internal/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-fast-transform'/)
})
