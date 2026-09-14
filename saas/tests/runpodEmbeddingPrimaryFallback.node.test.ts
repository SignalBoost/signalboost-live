import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generatePassiveLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSIONS,
  runpodPrimaryEmbeddingResolution,
} from '../lib/ai/cos/localEmbeddings.ts'
import { resolveRunpodPrimaryEmbeddingConfig } from '../lib/ai/cos/embeddingEndpoint.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function vector(size = LOCAL_EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: size }, (_, index) => (index + 1) / 10_000)
}

function configureBase(overrides: Record<string, string | undefined> = {}): void {
  const values: Record<string, string | undefined> = {
    LOCAL_AI_BASE_URL: 'https://api.deepinfra.com/v1/openai',
    LOCAL_AI_ALLOWED_HOSTS: 'api.deepinfra.com',
    LOCAL_AI_API_KEY: 'deepinfra-fallback-secret',
    LOCAL_AI_MODEL: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    LOCAL_AI_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    LOCAL_AI_EMBEDDING_BASE_URL: undefined,
    LOCAL_AI_EMBEDDING_API_KEY: undefined,
    RUNPOD_PRIMARY_EMBEDDING_BASE_URL: 'https://api.runpod.ai/v2/example/openai/v1',
    RUNPOD_PRIMARY_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    RUNPOD_PRIMARY_EMBEDDING_API_KEY: 'runpod-embedding-secret',
    RUNPOD_PRIMARY_EMBEDDING_TIMEOUT_MS: '5000',
    RUNPOD_API_KEY: undefined,
    COS_LOCAL_FIRST_ENABLED: undefined,
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test.afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
})

test('RunPod primary requires an exact vector-space model match and a dedicated embedding key', () => {
  const fallback = {
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    model: 'BAAI/bge-base-en-v1.5',
    apiKey: 'fallback-secret',
    timeoutMs: 120000,
  }

  const ready = resolveRunpodPrimaryEmbeddingConfig(fallback, {
    LOCAL_AI_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    RUNPOD_PRIMARY_EMBEDDING_BASE_URL: 'https://api.runpod.ai/v2/example/openai/v1',
    RUNPOD_PRIMARY_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    RUNPOD_PRIMARY_EMBEDDING_API_KEY: 'dedicated-key',
  })
  assert.equal(ready.reason, 'ready')
  assert.equal(ready.config?.apiKey, 'dedicated-key')
  assert.equal(ready.config?.timeoutMs, 20000)

  const mismatch = resolveRunpodPrimaryEmbeddingConfig(fallback, {
    LOCAL_AI_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    RUNPOD_PRIMARY_EMBEDDING_BASE_URL: 'https://api.runpod.ai/v2/example/openai/v1',
    RUNPOD_PRIMARY_EMBEDDING_MODEL: 'nomic-embed-text',
    RUNPOD_PRIMARY_EMBEDDING_API_KEY: 'dedicated-key',
  })
  assert.equal(mismatch.reason, 'model_space_mismatch')
  assert.equal(mismatch.config, null)

  const rootKeyOnly = resolveRunpodPrimaryEmbeddingConfig(fallback, {
    LOCAL_AI_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    RUNPOD_PRIMARY_EMBEDDING_BASE_URL: 'https://api.runpod.ai/v2/example/openai/v1',
    RUNPOD_PRIMARY_EMBEDDING_MODEL: 'BAAI/bge-base-en-v1.5',
    RUNPOD_API_KEY: 'must-not-be-reused',
  })
  assert.equal(rootKeyOnly.reason, 'missing_api_key')
  assert.equal(rootKeyOnly.config, null)
})

test('a healthy RunPod embedding primary handles the request without touching DeepInfra', async () => {
  configureBase()
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    assert.match(url, /^https:\/\/api\.runpod\.ai\//)
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer runpod-embedding-secret')
    return Response.json({ data: [{ index: 0, embedding: vector() }] })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('runpod-primary-success-regression')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.deepEqual(urls, ['https://api.runpod.ai/v2/example/openai/v1/embeddings'])
  assert.equal(runpodPrimaryEmbeddingResolution().reason, 'ready')
})

test('RunPod HTTP failure falls back to the existing DeepInfra embedding engine', async () => {
  configureBase()
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    if (url.startsWith('https://api.runpod.ai/')) return new Response('cold worker', { status: 503 })
    if (url === 'https://api.deepinfra.com/v1/openai/embeddings') {
      return Response.json({ data: [{ index: 0, embedding: vector() }] })
    }
    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('runpod-http-fallback-regression')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.deepEqual(urls, [
    'https://api.runpod.ai/v2/example/openai/v1/embeddings',
    'https://api.deepinfra.com/v1/openai/embeddings',
  ])
})

test('wrong-width RunPod vectors are rejected and the managed fallback supplies the canonical vector', async () => {
  configureBase()
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    if (url.startsWith('https://api.runpod.ai/')) {
      return Response.json({ data: [{ index: 0, embedding: vector(384) }] })
    }
    if (url === 'https://api.deepinfra.com/v1/openai/embeddings') {
      return Response.json({ data: [{ index: 0, embedding: vector() }] })
    }
    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('runpod-width-fallback-regression')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.equal(urls.length, 2)
})

test('a different 768-dimensional RunPod model is skipped before network so vector spaces cannot mix', async () => {
  configureBase({ RUNPOD_PRIMARY_EMBEDDING_MODEL: 'nomic-embed-text' })
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    assert.equal(url, 'https://api.deepinfra.com/v1/openai/embeddings')
    return Response.json({ data: [{ index: 0, embedding: vector() }] })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('model-space-mismatch-regression')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.deepEqual(urls, ['https://api.deepinfra.com/v1/openai/embeddings'])
  assert.equal(runpodPrimaryEmbeddingResolution().reason, 'model_space_mismatch')
})
