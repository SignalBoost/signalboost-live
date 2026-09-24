import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { massDistilledCanaryRequestTimeoutMs } from '../lib/ai/cos/runpodMassDistilledProvision.ts'

const provision = readFileSync(new URL('../lib/ai/cos/runpodMassDistilledProvision.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

test('a fast-ready worker gives the first request the full 150s instead of the old 35s', () => {
  assert.equal(massDistilledCanaryRequestTimeoutMs(0), 150_000)
  assert.equal(massDistilledCanaryRequestTimeoutMs(100_000), 150_000)
})

test('the request window shrinks as readiness uses the shared budget, never below 35s', () => {
  assert.equal(massDistilledCanaryRequestTimeoutMs(300_000), 115_000)
  assert.equal(massDistilledCanaryRequestTimeoutMs(380_000), 35_000)
  assert.equal(massDistilledCanaryRequestTimeoutMs(500_000), 35_000)
  assert.equal(massDistilledCanaryRequestTimeoutMs(Number.NaN), 35_000)
  assert.equal(massDistilledCanaryRequestTimeoutMs(-5), 150_000)
})

test('the worst-case canary end time and GPU cost are unchanged', () => {
  for (let elapsed = 0; elapsed <= 380_000; elapsed += 5_000) {
    assert.ok(elapsed + massDistilledCanaryRequestTimeoutMs(elapsed) <= 415_000, `elapsed ${elapsed}`)
  }
  assert.match(route, /maxDuration = 450/)
  const worstCaseGpuCostUsd = ((60 + 415) * 0.69) / 3600
  assert.ok(worstCaseGpuCostUsd < 0.2)
})

test('the live canary request uses the shared-budget window, not a fixed constant', () => {
  assert.match(provision, /const canaryTimeoutMs=massDistilledCanaryRequestTimeoutMs\(Date\.now\(\)-startedAt\)/)
  assert.match(provision, /signal:AbortSignal\.timeout\(canaryTimeoutMs\)/)
  assert.doesNotMatch(provision, /signal:AbortSignal\.timeout\(CANARY_TIMEOUT_MS\)/)
})
