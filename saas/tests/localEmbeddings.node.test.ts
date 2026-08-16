import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  LOCAL_EMBEDDING_DIMENSIONS,
  generateLocalEmbedding,
  generateLocalEmbeddings,
  generateReadyLocalEmbedding,
  getLocalEmbeddingHealth,
} from '../lib/ai/cos/localEmbeddings'
import { __resetRunPodLifecycleStateForTests } from '../lib/ai/local-inference'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  globalThis.fetch = ORIGINAL_FETCH
  __resetRunPodLifecycleStateForTests()
})

function configureRunPod() {
  process.env.COS_LOCAL_FIRST_ENABLED = 'true'
  process.env.LOCAL_AI_BASE_URL = 'https://abc-11434.proxy.runpod.net/v1'
  process.env.LOCAL_AI_ALLOWED_HOSTS = 'abc-11434.proxy.runpod.net'
  process.env.LOCAL_AI_API_KEY = 'test-secret'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  process.env.RUNPOD_API_KEY = 'runpod-test-key'
  process.env.RUNPOD_POD_ID = 'pod-test-123'
  process.env.COS_RUNPOD_WAKE_WAIT_MS = '0'
}

function vector(seed: number): number[] {
  return Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, (_, index) => (seed + index) / 10000)
}

test('local embeddings use the secured OpenAI-compatible embedding endpoint', async () => {
  configureRunPod()
  let calls = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls += 1
    assert.equal(String(input), 'https://abc-11434.proxy.runpod.net/v1/embeddings')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret')
    const body = JSON.parse(String(init?.body || '{}')) as { model?: string; input?: string[] }
    assert.equal(body.model, 'nomic-embed-text')
    assert.deepEqual(body.input, ['hello'])
    return new Response(JSON.stringify({ data: [{ embedding: vector(1), index: 0 }] }), { status: 200 })
  }) as typeof fetch

  const [embedding] = await generateLocalEmbeddings(['hello'])
  assert.equal(calls, 1)
  assert.equal(embedding.length, LOCAL_EMBEDDING_DIMENSIONS)
})

test('identical foreground query embeddings share one in-flight request and short-lived result', async () => {
  configureRunPod()
  process.env.COS_FOREGROUND_EMBEDDING_CACHE_TTL_MS = '30000'
  let embeddingRequests = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('api.runpod.io')) {
      if (url.includes('/start')) return new Response(JSON.stringify({ desiredStatus: 'RUNNING' }), { status: 200 })
      return new Response(JSON.stringify({ desiredStatus: 'RUNNING' }), { status: 200 })
    }
    if (url.endsWith('/v1/embeddings')) {
      embeddingRequests += 1
      await new Promise(resolve => setTimeout(resolve, 20))
      return new Response(JSON.stringify({ data: [{ embedding: vector(11), index: 0 }] }), { status: 200 })
    }
    throw new Error(`unexpected URL ${url}`)
  }) as typeof fetch

  const prompt = 'shared foreground semantic query regression'
  const [first, second] = await Promise.all([
    generateLocalEmbedding(prompt),
    generateLocalEmbedding(prompt),
  ])
  const third = await generateLocalEmbedding(prompt)

  assert.equal(embeddingRequests, 1)
  assert.equal(first.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.deepEqual(second, first)
  assert.deepEqual(third, first)
})

test('ordinary COS primes the shared query embedding before enterprise semantic budgets begin', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
  const exported = source.slice(source.indexOf('export async function tryCOSFirstAnswer'))
  const fresh = exported.indexOf('requiresFreshExternalEvidence(input.prompt)')
  const readiness = exported.indexOf('await ensureLocalInferenceRuntimeReady()')
  const prime = exported.indexOf('await generateLocalEmbedding(input.prompt)')
  const enterprise = exported.lastIndexOf('tryEnterpriseCOSFirstAnswer(input)')

  assert.ok(fresh >= 0, 'fresh/current-fact policy must remain first')
  assert.ok(readiness > fresh, 'ordinary runtime readiness must remain after fresh routing')
  assert.ok(prime > readiness, 'query embedding must be primed only after governed runtime readiness')
  assert.ok(enterprise > prime, 'enterprise semantic retrieval must start only after the shared query embedding is ready')
})

test('missing RunPod embedding model is pulled through the authenticated Ollama gateway and retried once', async () => {
  configureRunPod()
  const calls: Array<{ url: string; authorization: string; body: Record<string, unknown> }> = []
  let embeddingAttempts = 0

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    calls.push({
      url,
      authorization: new Headers(init?.headers).get('Authorization') || '',
      body,
    })
    if (url.endsWith('/v1/embeddings')) {
      embeddingAttempts += 1
      if (embeddingAttempts === 1) return new Response(JSON.stringify({ error: 'model not found' }), { status: 404 })
      return new Response(JSON.stringify({ data: [{ embedding: vector(2), index: 0 }] }), { status: 200 })
    }
    if (url.endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }
    if (url.endsWith('/api/pull')) {
      assert.equal(body.model, 'nomic-embed-text')
      assert.equal(body.stream, false)
      return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
    }
    throw new Error(`unexpected URL ${url}`)
  }) as typeof fetch

  const [embedding] = await generateLocalEmbeddings(['repair me'])
  assert.equal(embeddingAttempts, 2)
  assert.equal(embedding.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.ok(calls.some(call => call.url.endsWith('/api/pull')))
  assert.ok(calls.every(call => call.authorization === 'Bearer test-secret'))
})

test('embedding health check is read-only and reports a missing model without pulling it', async () => {
  configureRunPod()
  let pullCalls = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/v1/embeddings')) return new Response(JSON.stringify({ error: 'model not found' }), { status: 404 })
    if (url.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [] }), { status: 200 })
    if (url.endsWith('/api/pull')) {
      pullCalls += 1
      return new Response('{}', { status: 200 })
    }
    throw new Error(`unexpected URL ${url}`)
  }) as typeof fetch

  const health = await getLocalEmbeddingHealth()
  assert.equal(health.configured, true)
  assert.equal(health.healthy, false)
  assert.equal(health.modelAvailable, false)
  assert.equal(health.error, 'model_not_found')
  assert.equal(pullCalls, 0)
})

test('COS local-first kill switch blocks foreground embedding before any network or lifecycle activity', async () => {
  configureRunPod()
  process.env.COS_LOCAL_FIRST_ENABLED = 'false'
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  await assert.rejects(() => generateLocalEmbedding('disabled foreground'), /COS_LOCAL_FIRST_ENABLED=false/)
  assert.equal(calls, 0)
})

test('passive background embedding never calls RunPod lifecycle APIs', async () => {
  configureRunPod()
  let runpodCalls = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('api.runpod.io')) {
      runpodCalls += 1
      return new Response('{}', { status: 500 })
    }
    if (url.endsWith('/v1/embeddings')) {
      return new Response(JSON.stringify({ data: [{ embedding: vector(3), index: 0 }] }), { status: 200 })
    }
    throw new Error(`unexpected URL ${url}`)
  }) as typeof fetch

  const embedding = await generateReadyLocalEmbedding('passive', { allowWake: false })
  assert.equal(embedding.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.equal(runpodCalls, 0)
})

test('stopped RunPod is made ready before the first authorized foreground embedding request', async () => {
  configureRunPod()
  let stateCalls = 0
  let embeddingCalls = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('api.runpod.io')) {
      stateCalls += 1
      if (url.includes('/start')) return new Response(JSON.stringify({ desiredStatus: 'RUNNING' }), { status: 200 })
      return new Response(JSON.stringify({ desiredStatus: stateCalls === 1 ? 'EXITED' : 'RUNNING' }), { status: 200 })
    }
    if (url.endsWith('/v1/embeddings')) {
      embeddingCalls += 1
      return new Response(JSON.stringify({ data: [{ embedding: vector(4), index: 0 }] }), { status: 200 })
    }
    throw new Error(`unexpected URL ${url}`)
  }) as typeof fetch

  const embedding = await generateLocalEmbedding('wake foreground')
  assert.equal(embedding.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.ok(stateCalls >= 2)
  assert.equal(embeddingCalls, 1)
})
