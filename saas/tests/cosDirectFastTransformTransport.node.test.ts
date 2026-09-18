import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('owner simple text transforms bypass the browser/provenance orchestration chain', () => {
  const client = readFileSync(join(process.cwd(), 'lib/ai/cos/agentProgressClient.ts'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')

  assert.match(client, /DIRECT_FAST_TEXT_TRANSFORM/)
  assert.match(client, /directFastTextTransform \? '\/api\/cos-fast-transform' : '\/api\/cos-browser'/)
  assert.match(route, /isFastTextTransform\(prompt\)/)
  assert.match(route, /cosPrimaryPost\(/)
  assert.doesNotMatch(proxy, /'\/api\/cos-fast-transform'/)
})

test('the live CAP edit request qualifies for the direct fast-transform lane', () => {
  const client = readFileSync(join(process.cwd(), 'lib/ai/cos/agentProgressClient.ts'), 'utf8')
  assert.match(client, /edit\|rewrite\|rephrase\|proofread\|polish/)
})
