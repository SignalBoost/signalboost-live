import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const routeUrl = new URL('../app/api/internal/runtime-acceptance/route.ts', import.meta.url)
const oldTestUrl = new URL('./runtimeAcceptanceHarness.node.test.ts', import.meta.url)
const gates = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

test('temporary Production acceptance endpoint and credential-bearing harness remain removed', () => {
  assert.equal(existsSync(routeUrl), false)
  assert.equal(existsSync(oldTestUrl), false)
  assert.doesNotMatch(gates, /runtimeAcceptanceHarness\.node\.test\.ts/)
  assert.doesNotMatch(gates, /api\/internal\/runtime-acceptance/)
})

test('cleanup regression remains deployment-gated', () => {
  assert.match(gates, /tests\/runtimeAcceptanceCleanup\.node\.test\.ts/)
})
