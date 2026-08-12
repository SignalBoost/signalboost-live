import test from 'node:test'
import assert from 'node:assert/strict'

import {
  checkLocalEmbeddingHealth,
  generateLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSIONS,
} from '../lib/ai/cos/localEmbeddings.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function vector() {
  return Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, (_, index) => (index + 1) / 10_000)
}

function configureLoopback() {
  process.env.LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434/v1'
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  delete process.env.LOCAL_AI_EMBEDDING_AUTO_REPAIR
  delete process.env.LOCAL_AI_ALLOWED_HOSTS
  delete process.env.LOCAL_AI_API_KEY
}

function configureRunPod() {
  process.env.LOCAL_AI_BASE_URL = 'https://EXAMPLE-pod-11434.proxy.runpod.net/v1'
  process.env.LOCAL_AI_ALLOWED_HOSTS = 'example-pod-11434.proxy.runpod.net'
  process.env.LOCAL_AI_API_KEY = 'EXAMPLE_NOTAREAL_LOCAL_AI_KEY'
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  delete process.env.LOCAL_AI_EMBEDDING_AUTO_REPAIR
}

test.afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
})

test('local embeddings use the secured OpenAI-compatible embedding endpoint', async () => {
  configureLoopback()
  let observedUrl = ''
  let observedModel = ''

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    observedUrl = String(input)
    observedModel = String((JSON.parse(String(init?.body)) as { model?: string }).model || '')
    return new Response(JSON.stringify({ data: [{ embedding: vector() }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const result = await generateLocalEmbedding('semantic cache test')
  assert.equal(observedUrl, 'http://127.0.0.1:11434/v1/embeddings')
  assert.equal(observedModel, 'nomic-embed-text')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
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
      if (embeddingAttempts === 1) {
        return new Response(JSON.stringify({ error: { message: 'model "nomic-embed-text" not found, try pulling it first' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ data: [{ embedding: vector() }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.endsWith('/api/pull')) {
      return new Response(JSON.stringify({ status: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('unexpected URL', { status: 500 })
  }) as typeof fetch

  const result = await generateLocalEmbedding('repair semantic cache')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.equal(embeddingAttempts, 2)
  assert.deepEqual(calls.map(call => call.url), [
    'https://example-pod-11434.proxy.runpod.net/v1/embeddings',
    'https://example-pod-11434.proxy.runpod.net/api/pull',
    'https://example-pod-11434.proxy.runpod.net/v1/embeddings',
  ])
  assert.equal(calls[1].authorization, 'Bearer EXAMPLE_NOTAREAL_LOCAL_AI_KEY')
  assert.deepEqual(calls[1].body, { model: 'nomic-embed-text', stream: false })
})

test('embedding health check is read-only and reports a missing model without pulling it', async () => {
  configureRunPod()
  const urls: string[] = []

  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input))
    return new Response(JSON.stringify({ error: { message: 'model "nomic-embed-text" not found, try pulling it first' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const health = await checkLocalEmbeddingHealth()
  assert.equal(health.ok, false)
  assert.equal(health.model, 'nomic-embed-text')
  assert.match(health.error || '', /404/)
  assert.deepEqual(urls, ['https://example-pod-11434.proxy.runpod.net/v1/embeddings'])
})
