import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  checkLocalEmbeddingHealth,
  generateLocalEmbedding,
  generatePassiveLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSIONS,
} from '../lib/ai/cos/localEmbeddings.ts'
import { withRunpodWakePermission } from '../lib/ai/local-inference.ts'
import { desiredRunpodStartupContract } from '../lib/hub/runpodTelemetry.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function vector() {
  return Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, (_, index) => (index + 1) / 10_000)
}

function resetLifecycleEnv() {
  delete process.env.COS_LOCAL_FIRST_ENABLED
  delete process.env.RUNPOD_API_KEY
  delete process.env.RUNPOD_POD_ID
  delete process.env.RUNPOD_LIFECYCLE_ENABLED
}

function configureLoopback() {
  process.env.LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434/v1'
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  delete process.env.LOCAL_AI_EMBEDDING_AUTO_REPAIR
  delete process.env.COS_FOREGROUND_EMBEDDING_CACHE_TTL_MS
  delete process.env.LOCAL_AI_ALLOWED_HOSTS
  delete process.env.LOCAL_AI_API_KEY
  resetLifecycleEnv()
  process.env.RUNPOD_LIFECYCLE_ENABLED = 'false'
}

function configureRunPod() {
  process.env.LOCAL_AI_BASE_URL = 'https://EXAMPLE-pod-11434.proxy.runpod.net/v1'
  process.env.LOCAL_AI_ALLOWED_HOSTS = 'example-pod-11434.proxy.runpod.net'
  process.env.LOCAL_AI_API_KEY = 'EXAMPLE_NOTAREAL_LOCAL_AI_KEY'
  process.env.LOCAL_AI_MODEL = 'qwen2.5-coder:32b'
  process.env.LOCAL_AI_EMBEDDING_MODEL = 'nomic-embed-text'
  delete process.env.LOCAL_AI_EMBEDDING_AUTO_REPAIR
  delete process.env.COS_FOREGROUND_EMBEDDING_CACHE_TTL_MS
  resetLifecycleEnv()
  process.env.RUNPOD_LIFECYCLE_ENABLED = 'false'
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

test('identical foreground query embeddings share one in-flight request and short-lived result', async () => {
  configureLoopback()
  let embeddingRequests = 0

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    assert.equal(url, 'http://127.0.0.1:11434/v1/embeddings')
    embeddingRequests += 1
    await new Promise(resolve => setTimeout(resolve, 20))
    return new Response(JSON.stringify({ data: [{ embedding: vector(), index: 0 }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
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
    'https://example-pod-11434.proxy.runpod.net/v1/models',
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

test('COS local-first kill switch blocks foreground embedding before any network or lifecycle activity', async () => {
  configureRunPod()
  process.env.COS_LOCAL_FIRST_ENABLED = 'false'
  process.env.RUNPOD_LIFECYCLE_ENABLED = 'true'
  process.env.RUNPOD_API_KEY = 'EXAMPLE_NOTAREAL_RUNPOD_KEY'
  process.env.RUNPOD_POD_ID = 'examplepod'
  const urls: string[] = []

  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input))
    return new Response('unexpected network call', { status: 500 })
  }) as typeof fetch

  await assert.rejects(
    () => generateLocalEmbedding('must not wake while disabled'),
    /COS local-first is disabled/,
  )
  assert.deepEqual(urls, [])
})

test('passive background embedding never calls RunPod lifecycle APIs', async () => {
  configureRunPod()
  process.env.RUNPOD_LIFECYCLE_ENABLED = 'true'
  process.env.RUNPOD_API_KEY = 'EXAMPLE_NOTAREAL_RUNPOD_KEY'
  process.env.RUNPOD_POD_ID = 'examplepod'
  const urls: string[] = []

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    if (url === 'https://example-pod-11434.proxy.runpod.net/v1/embeddings') {
      return new Response(JSON.stringify({ data: [{ embedding: vector(), index: 0 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const result = await generatePassiveLocalEmbedding('background embedding')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.deepEqual(urls, ['https://example-pod-11434.proxy.runpod.net/v1/embeddings'])
})

test('stopped RunPod is made ready before the first authorized foreground embedding request', async () => {
  configureRunPod()
  process.env.RUNPOD_LIFECYCLE_ENABLED = 'true'
  process.env.RUNPOD_API_KEY = 'EXAMPLE_NOTAREAL_RUNPOD_KEY'
  process.env.RUNPOD_POD_ID = 'examplepod'

  const urls: string[] = []
  let modelChecks = 0
  let resumeRequested = false
  const startupContract = desiredRunpodStartupContract()

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)

    if (url === 'https://example-pod-11434.proxy.runpod.net/v1/models') {
      modelChecks += 1
      if (modelChecks === 1) return new Response('', { status: 404 })
      return new Response(JSON.stringify({ data: [{ id: 'qwen2.5-coder:32b' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.startsWith('https://api.runpod.io/graphql')) {
      const query = String((JSON.parse(String(init?.body)) as { query?: string }).query || '')
      if (query.includes('myself { pods')) {
        return new Response(JSON.stringify({
          data: {
            myself: {
              pods: [{
                id: 'examplepod',
                name: 'embedding-test',
                desiredStatus: 'EXITED',
                costPerHr: 0.44,
                runtime: null,
              }],
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (query.includes('podResume')) {
        resumeRequested = true
        return new Response(JSON.stringify({
          data: { podResume: { id: 'examplepod', desiredStatus: 'RUNNING' } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ errors: [{ message: 'unexpected GraphQL operation' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url === 'https://rest.runpod.io/v1/pods/examplepod') {
      return new Response(JSON.stringify({
        id: 'examplepod',
        desiredStatus: 'EXITED',
        image: 'runpod/pytorch:test',
        dockerEntrypoint: startupContract.dockerEntrypoint,
        dockerStartCmd: startupContract.dockerStartCmd,
        volumeMountPath: '/workspace',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (url === 'https://example-pod-11434.proxy.runpod.net/v1/embeddings') {
      return new Response(JSON.stringify({ data: [{ embedding: vector(), index: 0 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(`unexpected URL: ${url}`, { status: 500 })
  }) as typeof fetch

  const result = await withRunpodWakePermission({
    allowed: true,
    source: 'user_interactive',
    interactionId: '3c9479dd-eec5-4f7c-91de-42f447379b43',
    issuedAtMs: Date.now(),
    ageMs: 0,
    reason: 'test_authorized_foreground_embedding',
  }, () => generateLocalEmbedding('wake before semantic retrieval'))

  const embeddingsIndex = urls.indexOf('https://example-pod-11434.proxy.runpod.net/v1/embeddings')
  const finalModelCheckIndex = urls.lastIndexOf('https://example-pod-11434.proxy.runpod.net/v1/models')
  assert.equal(result.length, LOCAL_EMBEDDING_DIMENSIONS)
  assert.equal(resumeRequested, true)
  assert.equal(modelChecks, 2)
  assert.ok(finalModelCheckIndex >= 0)
  assert.ok(embeddingsIndex > finalModelCheckIndex, 'embedding request must occur only after runtime readiness succeeds')
})