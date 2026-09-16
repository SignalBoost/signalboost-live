// saas/tests/runpodPrimaryThinkingRetry.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { callLocalModel, LOCAL_MODEL_OUTPUT_TRUNCATED } from '../lib/ai/local-inference.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch
const runpodConfig = { baseUrl: 'https://pod-8000.proxy.runpod.net/v1', model: 'qwen3:30b', timeoutMs: 5000, provider: 'runpod' as const }

test.beforeEach(() => { process.env.RUNPOD_PRIMARY_ENABLED = 'false' })
test.afterEach(() => { process.env = { ...originalEnv }; globalThis.fetch = originalFetch })

const reply = (content: string, finish: string, completionTokens: number) => new Response(JSON.stringify({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 2532, completion_tokens: completionTokens, total_tokens: 2532 + completionTokens },
}), { status: 200, headers: { 'Content-Type': 'application/json' } })

test('the exact Production failure: empty content at the token limit is marked as hidden-reasoning exhaustion', async () => {
  globalThis.fetch = (async () => reply('', 'length', 360)) as typeof fetch
  await assert.rejects(callLocalModel({ prompt: 'what is the capital of Portugal?', maxTokens: 360 }, runpodConfig), (error: any) => {
    assert.equal(error.message, LOCAL_MODEL_OUTPUT_TRUNCATED)
    assert.equal(error.emptyContent, true)
    return true
  })
})

test('a genuinely long answer cut at the limit keeps the unchanged truncation error without the empty marker', async () => {
  globalThis.fetch = (async () => reply('Lisbon is the capital and largest city of Portugal, and', 'length', 360)) as typeof fetch
  await assert.rejects(callLocalModel({ prompt: 'describe Lisbon', maxTokens: 360 }, runpodConfig), (error: any) => {
    assert.equal(error.message, LOCAL_MODEL_OUTPUT_TRUNCATED)
    assert.equal(error.emptyContent, false)
    return true
  })
})

test('disableThinking and small-budget RunPod calls send reasoning_effort none', async () => {
  const bodies: any[] = []
  globalThis.fetch = (async (url, init) => { if (String(url).includes('/chat/completions')) bodies.push(JSON.parse(String(init?.body))); return reply('Lisbon.', 'stop', 3) }) as typeof fetch
  assert.equal(await callLocalModel({ prompt: 'capital of Portugal?', maxTokens: 360, disableThinking: true }, runpodConfig), 'Lisbon.')
  assert.equal(await callLocalModel({ prompt: 'capital of Portugal?', maxTokens: 360 }, runpodConfig), 'Lisbon.')
  assert.equal(bodies[0].reasoning_effort, 'none')
  assert.equal(bodies[1].reasoning_effort, 'none')
  assert.equal(bodies[1].max_tokens, 360)
  assert.equal(bodies[0].max_tokens, 360)
})

test('routing retries the RunPod primary once with thinking off only for empty-content exhaustion, then keeps the fallback', () => {
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function callLocalModel(')
  const routing = source.slice(start, source.indexOf('export async function checkLocalInferenceHealth', start))
  assert.match(routing, /if \(!isEmptyThinkingTruncation\(error\) \|\| args\.disableThinking === true \|\| runpodSmallBudgetThinkingOff\(args, 'runpod'\)\) throw error/)
  assert.match(routing, /callConfiguredModel\(\{ \.\.\.args, disableThinking: true \}, runpodConfig\)/)
  assert.match(routing, /\[runpod-primary-thinking-retry\]/)
  assert.match(routing, /return callConfiguredModel\(args, ownedAttempted \? \{ \.\.\.config, fallbackFromOwned: true \} : config\)/)
  assert.equal((routing.match(/disableThinking: true/g) || []).length, 1, 'exactly one retry, never a loop')
})

// Small-budget policy must not leak into larger generations or other providers.
test('RunPod budgets at or below 1024 tokens are thinking-off from the start; larger budgets and other providers are unchanged', async () => {
  process.env.LOCAL_AI_REASONING_EFFORT = 'high'
  const bodies: any[] = []
  globalThis.fetch = (async (url, init) => { if (String(url).includes('/chat/completions')) bodies.push(JSON.parse(String(init?.body))); return reply('ok', 'stop', 2) }) as typeof fetch
  await callLocalModel({ prompt: 'classify', maxTokens: 1024 }, runpodConfig)
  await callLocalModel({ prompt: 'draft a long answer', maxTokens: 4096 }, runpodConfig)
  await callLocalModel({ prompt: 'classify', maxTokens: 360 }, { baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'Qwen/Qwen3.6-35B-A3B', apiKey: 'k', timeoutMs: 5000, provider: 'deepinfra' })
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(source, /runpodSmallBudgetThinkingOff\(args, provider\)/)
  assert.equal(bodies[0].reasoning_effort, 'none')
  assert.equal(bodies[0].max_tokens, 1024)
  assert.equal('reasoning_effort' in bodies[1], false)
  assert.equal(bodies[2].reasoning_effort, 'high')
})
