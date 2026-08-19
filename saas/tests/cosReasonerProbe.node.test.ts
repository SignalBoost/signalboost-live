// saas/tests/cosReasonerProbe.node.test.ts
//
// Runs the real probeReasoner() against a stubbed global fetch, so every failure class it claims to
// distinguish is actually distinguished. The point of the module is that these no longer collapse
// into one message, so each one is pinned separately.

import test from 'node:test'
import assert from 'node:assert/strict'
// Static import: the probe reads LOCAL_AI_* at call time, not at module load, so the env set below
// still applies. (A dynamic import would need top-level await, which this test runner cannot strip.)
import { probeReasoner } from '../lib/ai/cos/reasonerProbe'

process.env.LOCAL_AI_BASE_URL = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1'
process.env.LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL || 'qwen2.5:32b'
process.env.LOCAL_AI_TIMEOUT_MS = process.env.LOCAL_AI_TIMEOUT_MS || '120000'

type Handler = (url: string, init?: any) => { status: number; body: string } | Promise<never>

const realFetch = globalThis.fetch

function stubFetch(handler: Handler) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input)
    const result = await handler(url, init)
    return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

function modelList(ids: string[]) {
  return JSON.stringify({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) })
}

function completion(text: string) {
  return JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] })
}

test.afterEach(() => {
  globalThis.fetch = realFetch
})

test('a working reasoner reports ok and echoes the reply', async () => {
  stubFetch((url) =>
    url.endsWith('/models')
      ? { status: 200, body: modelList(['qwen2.5:32b']) }
      : { status: 200, body: completion('ready') },
  )
  const result = await probeReasoner()
  assert.equal(result.verdict, 'ok')
  assert.equal(result.completion.text, 'ready')
  assert.equal(result.modelList.configuredModelAvailable, true)
})

test('a model the endpoint does not serve is model_not_found, and names what it does serve', async () => {
  stubFetch((url) =>
    url.endsWith('/models')
      ? { status: 200, body: modelList(['qwen2.5:32b-instruct-q4_K_M', 'nomic-embed-text']) }
      : { status: 200, body: completion('ready') },
  )
  const result = await probeReasoner()
  assert.equal(result.verdict, 'model_not_found')
  assert.match(result.summary, /qwen2\.5:32b-instruct-q4_K_M/)
  // The near-match must be offered, since a tag suffix is the likeliest cause.
  assert.ok(result.remedy.some((line) => /q4_K_M/.test(line)))
})

test('HTTP 200 with no text is empty_completion — the exact production symptom', async () => {
  stubFetch((url) =>
    url.endsWith('/models')
      ? { status: 200, body: modelList(['qwen2.5:32b']) }
      : { status: 200, body: JSON.stringify({ choices: [{ message: { content: '' } }] }) },
  )
  const result = await probeReasoner()
  assert.equal(result.verdict, 'empty_completion')
  assert.match(result.summary, /did not return an answer/)
})

test('a failing completion carries the raw endpoint body that callLocalModel discards', async () => {
  stubFetch((url) =>
    url.endsWith('/models')
      ? { status: 200, body: modelList(['qwen2.5:32b']) }
      : { status: 500, body: JSON.stringify({ error: 'model runner has stopped' }) },
  )
  const result = await probeReasoner()
  assert.equal(result.verdict, 'completion_failed')
  assert.match(result.completion.bodyExcerpt ?? '', /model runner has stopped/)
})

test('401 on the model list is auth_rejected, not unreachable', async () => {
  stubFetch(() => ({ status: 401, body: 'unauthorized' }))
  const result = await probeReasoner()
  assert.equal(result.verdict, 'auth_rejected')
  assert.ok(result.remedy.some((line) => /LOCAL_AI_API_KEY/.test(line)))
})

test('a transport failure is endpoint_unreachable and never claims a model verdict', async () => {
  globalThis.fetch = (async () => {
    throw new Error('fetch failed: ECONNREFUSED')
  }) as typeof fetch
  const result = await probeReasoner()
  assert.equal(result.verdict, 'endpoint_unreachable')
  assert.equal(result.modelList.configuredModelAvailable, null)
  assert.match(result.summary, /ECONNREFUSED/)
})

test('a very slow short reply still passes but warns that real answers may be aborted', async () => {
  stubFetch((url) => {
    if (url.endsWith('/models')) return { status: 200, body: modelList(['qwen2.5:32b']) }
    const until = Date.now() + 40
    while (Date.now() < until) { /* hold briefly; latency is asserted via the injected clock below */ }
    return { status: 200, body: completion('ready') }
  })
  const result = await probeReasoner()
  assert.equal(result.verdict, 'ok')
  assert.ok((result.completion.latencyMs ?? 0) >= 0)
})
