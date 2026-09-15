// saas/tests/cosUniversityGraduateServedIdentity.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const runtime = readFileSync('lib/ai/cos/cosUniversityGraduateRuntime.ts', 'utf8')
const route = readFileSync('app/api/cron/cos-university-graduate-activation/route.ts', 'utf8')
const gateway = readFileSync('lib/ai/cos/runpodDistilledV6Provision.ts', 'utf8')

test('the iTMounts serving gateway exposes /ready with the model but no /models route', () => {
  assert.match(gateway, /@app\.get\('\/ready'\)/)
  assert.match(gateway, /return \{'ready':True,'model':MODEL\}/)
  assert.doesNotMatch(gateway, /@app\.get\('\/v1\/models'\)/)
})

test('graduate_ai identity is proven by /models, falling back to the gateway /ready contract on 404', () => {
  assert.match(runtime, /input\.runtimeProfile === 'graduate_ai'\s*\?\s*await proveGraduateServedIdentity\(runtime\.inference, decision\.runtimeModelId\)/)
  assert.match(runtime, /response\.status === 404 \|\| response\.status === 405/)
  assert.match(runtime, /data\?\.ready === true && reported === model/)
  assert.match(runtime, /health\.model !== decision\.runtimeModelId/)
})

test('cold-start wait is bounded and fits the activation route ceiling', () => {
  assert.match(runtime, /GRADUATE_RUNTIME_READY_WAIT_MS = 240_000/)
  assert.match(runtime, /Math\.min\(options\.waitMs \?\? GRADUATE_RUNTIME_READY_WAIT_MS, 280_000\)/)
  assert.match(route, /export const maxDuration = 300/)
})
