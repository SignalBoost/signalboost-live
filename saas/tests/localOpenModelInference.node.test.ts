import test from 'node:test'
import assert from 'node:assert/strict'

import { callLocalModel, checkLocalInferenceHealth, localInferenceConfigFromEnv } from '../lib/ai/local-inference.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

test.afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
})

test('local inference configuration defaults to the internal ai-brain endpoint and requires a model', () => {
  delete process.env.LOCAL_AI_BASE_URL
  process.env.LOCAL_AI_MODEL = 'signalboost-local-brain'
  const config = localInferenceConfigFromEnv()
  assert.equal(config.baseUrl, 'http://ai-brain:8000/v1')
  assert.equal(config.model, 'signalboost-local-brain')
})

test('local inference rejects arbitrary external hosts', () => {
  process.env.LOCAL_AI_BASE_URL = 'https://example.com/v1'
  process.env.LOCAL_AI_MODEL = 'signalboost-local-brain'
  assert.throws(() => localInferenceConfigFromEnv(), /host is not allowed/)
})

test('local inference sends OpenAI-compatible chat completions with appliance authorization', async () => {
  let observedUrl = ''
  let observedAuthorization = ''
  let observedBody: Record<string, unknown> = {}
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    observedUrl = String(input)
    observedAuthorization = new Headers(init?.headers).get('Authorization') || ''
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ choices: [{ message: { content: 'local answer' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  const result = await callLocalModel(
    { prompt: 'diagnose incident', maxTokens: 512 },
    { baseUrl: 'http://127.0.0.1:8000/v1', model: 'signalboost-local-brain', apiKey: 'device-secret', timeoutMs: 5000 },
  )

  assert.equal(result, 'local answer')
  assert.equal(observedUrl, 'http://127.0.0.1:8000/v1/chat/completions')
  assert.equal(observedAuthorization, 'Bearer device-secret')
  assert.equal(observedBody.model, 'signalboost-local-brain')
  assert.equal(observedBody.max_tokens, 512)
})

test('health check verifies the configured served model', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: 'signalboost-local-brain' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
  const health = await checkLocalInferenceHealth({ baseUrl: 'http://127.0.0.1:8000/v1', model: 'signalboost-local-brain', timeoutMs: 5000 })
  assert.deepEqual(health, { ok: true, model: 'signalboost-local-brain' })
})
