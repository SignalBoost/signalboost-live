// saas/tests/graduateWarmGate.node.test.ts
// Warm-only graduates in live chat (2026-09-27): RunPod serverless graduates scaled 0/1 were 0/59 in chat this week.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  GRADUATE_WARM_CACHE_MS,
  resetGraduateWarmCache,
  runpodGraduateEndpointWarm,
  runpodGraduateWarmGateEvidence,
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

test('live chat reaches only warm graduates, for EVERY role (2026-10-04: 82 live timeouts came from sleeping specialists)', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(workers, /import \{ runpodGraduateEndpointWarm \} from '@\/lib\/ai\/cos\/graduateWarmGate'/)
  const at = workers.indexOf('function createGraduateWorker(')
  const execute = workers.slice(workers.indexOf('async execute(request) {', at), workers.indexOf('const effective = toLocalModelCallArgs(request, role)', at))
  // No role exception remains: the gate applies to every live-chat request.
  assert.doesNotMatch(execute, /role === 'primary' \|\| role === 'coder'/)
  assert.match(execute, /const liveChat = INTERACTIVE_GRADUATE_FEATURES\.has\(String\(request\.usageContext\?\.feature \|\| ''\)\.trim\(\)\.toLowerCase\(\)\)\s*if \(liveChat && !\(await runpodGraduateEndpointWarm\(runtime\.inference\.baseUrl\)\)\) return null/)
  // The skip happens before any attempt is recorded, so a sleeping graduate is never charged a failure.
  assert.ok(execute.indexOf('return null') < execute.length)
  const recordAt = workers.indexOf("recordGraduateServingAttempt({ ...attemptBase, phase: 'attempt_started'", at)
  assert.ok(workers.indexOf('runpodGraduateEndpointWarm(runtime.inference.baseUrl)', at) < recordAt)
})

test('live timeouts record whether the endpoint was cold, booting or warm - both the thrown and the null path', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  const at = workers.indexOf('function createGraduateWorker(')
  const execute = workers.slice(at, workers.indexOf('function baseOpenModelWorkers()', at))
  assert.match(execute, /errorClass: failureOutcome === 'timeout'\s*\? `runtime_deadline_exceeded:\$\{await runpodGraduateEndpointWorkerState\(runtime\.inference\.baseUrl\)\}\$\{gateEvidence\}`/)
  assert.match(execute, /nullOutcome === 'timeout' \? \{ errorClass: `runtime_deadline_exceeded:\$\{await runpodGraduateEndpointWorkerState\(runtime\.inference\.baseUrl\)\}\$\{gateEvidence\}` \}/)
  assert.match(execute, /outcome: nullOutcome === 'timeout' \? 'timeout' : 'empty'/)
  // No bare, state-less deadline class remains on the live path.
  assert.doesNotMatch(execute, /'runtime_deadline_exceeded'/)
})
test('the gate remembers what it saw: running, idle, cold or unreadable', async () => {
  let clock = 5_000_000
  const now = () => clock
  const cases: Array<[Parameters<typeof healthFetch>[0], string, boolean]> = [
    [{ idle: 0, running: 1 }, 'running', true],
    [{ idle: 1, running: 0 }, 'idle', true],
    [{ idle: 0, running: 0 }, 'cold', false],
    ['http500', 'unreadable', false],
    ['error', 'unreadable', false],
  ]
  for (const [workers, seen, warm] of cases) {
    resetGraduateWarmCache()
    assert.equal(await runpodGraduateEndpointWarm(BASE, { fetchImpl: healthFetch(workers).fetchImpl, apiKey: 'k', now }), warm)
    assert.equal(runpodGraduateWarmGateEvidence(BASE, { now }), `gate=${seen}@0s`)
  }
})

test('the evidence carries the age of the reading the gate used', async () => {
  resetGraduateWarmCache()
  let clock = 9_000_000
  const deps = { fetchImpl: healthFetch({ idle: 1, running: 0 }).fetchImpl, apiKey: 'k', now: () => clock }
  await runpodGraduateEndpointWarm(BASE, deps)
  clock += 24_400
  // A second gate call inside the cache window reuses the old reading; the evidence shows its true age.
  assert.equal(await runpodGraduateEndpointWarm(BASE, deps), true)
  assert.equal(runpodGraduateWarmGateEvidence(BASE, { now: deps.now }), 'gate=idle@24s')
})

test('no cached reading and non-RunPod runtimes are named, never guessed', () => {
  resetGraduateWarmCache()
  assert.equal(runpodGraduateWarmGateEvidence(BASE), 'gate=none')
  assert.equal(runpodGraduateWarmGateEvidence('https://api.deepinfra.com/v1/openai'), 'gate=not_runpod')
})

test('gate evidence is read at decision time, only for live chat, and the shadow path carries it too', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  const at = workers.indexOf('function createGraduateWorker(')
  const execute = workers.slice(at, workers.indexOf('function baseOpenModelWorkers()', at))
  const gateAt = execute.indexOf('if (liveChat && !(await runpodGraduateEndpointWarm(runtime.inference.baseUrl))) return null')
  const evidenceAt = execute.indexOf("const gateEvidence = liveChat ? `:${runpodGraduateWarmGateEvidence(runtime.inference.baseUrl)}` : ''")
  const callAt = execute.indexOf('const text = await callLocalModel(')
  assert.ok(gateAt > 0 && evidenceAt > gateAt && callAt > evidenceAt)
  const shadow = workers.slice(workers.indexOf('export async function runWorkforceApprenticeShadow('))
  assert.match(shadow, /if \(!\(await runpodGraduateEndpointWarm\(runtime\.inference\.baseUrl\)\)\) return\s*const gateEvidence = runpodGraduateWarmGateEvidence\(runtime\.inference\.baseUrl\)/)
  assert.match(shadow, /`runtime_deadline_exceeded:\$\{await runpodGraduateEndpointWorkerState\(runtime\.inference\.baseUrl\)\}:\$\{gateEvidence\}`/)
})
// end of saas/tests/graduateWarmGate.node.test.ts (if this line is missing, the paste was cut short)
