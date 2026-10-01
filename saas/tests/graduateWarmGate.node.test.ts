// saas/tests/graduateWarmGate.node.test.ts
// Warm-only graduates in live chat (2026-09-27): RunPod serverless graduates scaled 0/1 were 0/59 in chat this week.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  GRADUATE_WARM_CACHE_MS,
  resetGraduateWarmCache,
  runpodGraduateEndpointWarm,
  runpodServerlessEndpointIdFromBaseUrl,
} from '../lib/ai/cos/graduateWarmGate.ts'

const BASE = 'https://abc123xyz.api.runpod.ai/v1'

function healthFetch(workers: { idle: number; running: number } | 'error' | 'http500') {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(String(url))
    if (workers === 'error') throw new Error('network')
    if (workers === 'http500') return new Response('down', { status: 500 })
    return new Response(JSON.stringify({ workers, jobs: {} }), { status: 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

test('only exact RunPod serverless hosts are subject to the cold-start rule', () => {
  assert.equal(runpodServerlessEndpointIdFromBaseUrl(BASE), 'abc123xyz')
  assert.equal(runpodServerlessEndpointIdFromBaseUrl('https://api.deepinfra.com/v1/openai'), null)
  assert.equal(runpodServerlessEndpointIdFromBaseUrl('not a url'), null)
})

test('a cold endpoint (0 workers) is skipped; a warm one is used', async () => {
  resetGraduateWarmCache()
  const cold = healthFetch({ idle: 0, running: 0 })
  assert.equal(await runpodGraduateEndpointWarm(BASE, { fetchImpl: cold.fetchImpl, apiKey: 'k' }), false)
  assert.equal(cold.calls[0], 'https://api.runpod.ai/v2/abc123xyz/health')

  resetGraduateWarmCache()
  const warm = healthFetch({ idle: 1, running: 0 })
  assert.equal(await runpodGraduateEndpointWarm(BASE, { fetchImpl: warm.fetchImpl, apiKey: 'k' }), true)
  resetGraduateWarmCache()
  const busy = healthFetch({ idle: 0, running: 1 })
  assert.equal(await runpodGraduateEndpointWarm(BASE, { fetchImpl: busy.fetchImpl, apiKey: 'k' }), true)
})

test('errors, HTTP failures and a missing key all count as not warm', async () => {
  for (const mode of ['error', 'http500'] as const) {
    resetGraduateWarmCache()
    assert.equal(await runpodGraduateEndpointWarm(BASE, { fetchImpl: healthFetch(mode).fetchImpl, apiKey: 'k' }), false)
  }
  resetGraduateWarmCache()
  const noKey = healthFetch({ idle: 1, running: 0 })
  assert.equal(await runpodGraduateEndpointWarm(BASE, { fetchImpl: noKey.fetchImpl, apiKey: null }), false)
  assert.equal(noKey.calls.length, 0)
})

test('non-RunPod graduate runtimes are never blocked', async () => {
  resetGraduateWarmCache()
  const f = healthFetch({ idle: 0, running: 0 })
  assert.equal(await runpodGraduateEndpointWarm('https://api.deepinfra.com/v1/openai', { fetchImpl: f.fetchImpl, apiKey: 'k' }), true)
  assert.equal(f.calls.length, 0)
})

test('the health read is cached per endpoint for a short window', async () => {
  resetGraduateWarmCache()
  let clock = 1_000_000
  const f = healthFetch({ idle: 1, running: 0 })
  const deps = { fetchImpl: f.fetchImpl, apiKey: 'k', now: () => clock }
  await runpodGraduateEndpointWarm(BASE, deps)
  await runpodGraduateEndpointWarm(BASE, deps)
  assert.equal(f.calls.length, 1)
  clock += GRADUATE_WARM_CACHE_MS + 1
  await runpodGraduateEndpointWarm(BASE, deps)
  assert.equal(f.calls.length, 2)
})

test('the graduate worker warm gate protects only primary/coder while specialist Workforce roles can wake on real demand', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(workers, /import \{ runpodGraduateEndpointWarm \} from '@\/lib\/ai\/cos\/graduateWarmGate'/)
  const at = workers.indexOf('function createGraduateWorker(')
  const execute = workers.slice(workers.indexOf('async execute(request) {', at), workers.indexOf('const effective = toLocalModelCallArgs(request, role)', at))
  assert.match(execute, /role === 'primary' \|\| role === 'coder'/)
  assert.match(execute, /INTERACTIVE_GRADUATE_FEATURES\.has\(/)
  assert.match(execute, /!\(await runpodGraduateEndpointWarm\(runtime\.inference\.baseUrl\)\)\) return null/)
})

test('null responses at the configured deadline are classified as infrastructure timeouts', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  const at = workers.indexOf('function createGraduateWorker(')
  const execute = workers.slice(at, workers.indexOf('function baseOpenModelWorkers()', at))
  assert.match(execute, /runtime_deadline_exceeded/)
  assert.match(execute, /outcome: nullOutcome === 'timeout' \? 'timeout' : 'empty'/)
})
