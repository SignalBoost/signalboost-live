import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('browser text transforms keep the canonical gated ingress and are rewritten server-side', () => {
  const client = readFileSync(join(process.cwd(), 'lib/ai/cos/agentProgressClient.ts'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')

  assert.match(client, /const endpoint = builderRequest\?\.endpoint \?\? '\/api\/cos-browser'/)
  assert.doesNotMatch(client, /directFastTextTransform/)
  assert.match(proxy, /fastTextTransformRequest\(req\)/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-fast-transform'/)
  assert.match(route, /x-signalboost-fast-transform-internal/)
  assert.match(route, /fast_transform_ingress_required/)
  assert.match(route, /isFastTextTransform\(prompt\)/)
  assert.match(route, /cosPrimaryPost\(/)
})

test('the live CAP edit request matches the server fast-transform detector', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /edit\|rewrite\|rephrase\|proofread\|polish/)
})
