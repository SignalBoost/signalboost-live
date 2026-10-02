import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('rolling exact-canary admission includes evaluation_ready artifacts', () => {
  const start = route.indexOf('async function issueRollingCanaryApproval')
  assert.ok(start >= 0)
  const body = route.slice(start, start + 9000)
  assert.ok(body.includes(".in('status',['evaluation_ready','evaluation_pending'])"))
  assert.ok(body.split(".in('status',['evaluation_ready','evaluation_pending'])").length >= 3)
})
