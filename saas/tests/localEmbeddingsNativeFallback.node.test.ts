import test from 'node:test'
import assert from 'node:assert/strict'

import {
  checkLocalEmbeddingHealth,
  generatePassiveLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSIONS,
} from '../lib/ai/cos/localEmbeddings.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function vector() {
  return Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, (_, index) => (index + 1) / 10_000)
}

function configureRunPod() {
  process.env.LOCAL_AI_BASE_URL = 'https://EXAMPLE-pod-11434.proxy.runpod.net/v1'
  process.env.LOCAL_AI_ALLOWED_HOSTS = 'example-pod-11434.proxy.runpod.net'
  process.env.LOCAL_AI_API_KEY = 'EXAMPLE_NOTAREAL_LOCAL_AI_KEY'
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  delete process.env.LOCAL_AI_EMBEDDING_AUTO_REPAIR
  delete process.env.RUNPOD_API_KEY
  delete process.env.RUNPOD_POD_ID
  process.env.RUNPOD_LIFECYCLE_ENABLED = 'false'
}

test.afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
})

test('non-model-specific OpenAI embedding 404 falls back to authenticated native Ollama embed', async () => {
  configureRunPod()
  const calls: Array<{ url: string; authorization: string; apiKey: string }> = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({
      url,
      authorization: headers.get('Authorization') || '',
      apiKey: headers.get('x-api-key') || '',
    })

    if (url.endsWith('/v1/embeddings')) return new Response('', { status: 404 })
    if (url.endsWith('/api/embed')) {
      return new Response(JSON.stringify({ embeddings: [vector()] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('native transport fallback')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.deepEqual(calls.map(call => call.url), [
    'https://example-pod-11434.proxy.runpod.net/v1/embeddings',
    'https://example-pod-11434.proxy.runpod.net/api/embed',
  ])
  assert.equal(calls[1].authorization, 'Bearer EXAMPLE_NOTAREAL_LOCAL_AI_KEY')
  assert.equal(calls[1].apiKey, 'EXAMPLE_NOTAREAL_LOCAL_AI_KEY')
})

test('non-v1 embedding 404 does not probe native Ollama paths', async () => {
  configureRunPod()
  process.env.LOCAL_AI_BASE_URL = 'https://EXAMPLE-pod-11434.proxy.runpod.net/openai'
  const urls: string[] = []

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    return new Response('', { status: 404 })
  }) as typeof fetch

  await assert.rejects(
    () => generatePassiveLocalEmbedding('do not widen fallback'),
    /localEmbeddings: HTTP 404/,
  )
  assert.deepEqual(urls, [
    'https://example-pod-11434.proxy.runpod.net/openai/embeddings',
  ])
})

test('native fallback preserves missing-model auto-repair and retries native transport once', async () => {
  configureRunPod()
  const urls: string[] = []
  let nativeAttempts = 0

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)

    if (url.endsWith('/v1/embeddings')) return new Response('', { status: 404 })
    if (url.endsWith('/api/embed')) {
      nativeAttempts += 1
      if (nativeAttempts === 1) {
        return new Response(JSON.stringify({ error: 'model "nomic-embed-text" not found, try pulling it first' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ embeddings: [vector()] }), {
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
    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('repair through native transport')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.equal(nativeAttempts, 2)
  assert.deepEqual(urls, [
    'https://example-pod-11434.proxy.runpod.net/v1/embeddings',
    'https://example-pod-11434.proxy.runpod.net/api/embed',
    'https://example-pod-11434.proxy.runpod.net/api/pull',
    'https://example-pod-11434.proxy.runpod.net/api/embed',
  ])
})

test('embedding health uses native fallback but remains read-only when model is missing', async () => {
  configureRunPod()
  const urls: string[] = []

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    if (url.endsWith('/v1/embeddings')) return new Response('', { status: 404 })
    if (url.endsWith('/api/embed')) {
      return new Response(JSON.stringify({ error: 'model "nomic-embed-text" not found, try pulling it first' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const health = await checkLocalEmbeddingHealth()
  assert.equal(health.ok, false)
  assert.equal(health.model, 'nomic-embed-text')
  assert.match(health.error || '', /404/)
  assert.deepEqual(urls, [
    'https://example-pod-11434.proxy.runpod.net/v1/embeddings',
    'https://example-pod-11434.proxy.runpod.net/api/embed',
  ])
})
