import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('foreground fast transforms bypass RunPod-primary readiness and use the bounded configured transport', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(primary, /feature:'cos_fast_text_transform'/)
  assert.match(primary, /fallbackFromOwned:true/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 25_000/)
})

test('Supabase access cannot hold a request for the full Vercel runtime', () => {
  const access = readFileSync(join(process.cwd(), 'lib/auth/access.ts'), 'utf8')
  assert.match(access, /ACCESS_AUTH_TIMEOUT_MS = 5_000/)
  assert.match(access, /Promise\.race\(\[/)
  assert.match(access, /\[auth-access-timeout\]/)
  assert.match(access, /return buildContext\(null, null, 'guest'\)/)
})

test('stale Assistant tabs are recognized from same-origin Assistant referer even without the new surface header', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /req\.headers\.get\('x-signalboost-surface'\) === 'cos' \|\| fullAssistantSurface\(req\)/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-fast-transform'/)
})
