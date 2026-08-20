// saas/tests/cosEmbeddingEndpointSplit.node.test.ts
//
// Pins the migration safety property found on Aug 20 2026: embeddings used to be forced onto the
// reasoner's endpoint via localInferenceConfigFromEnv(), so repointing LOCAL_AI_BASE_URL at a
// per-token inference host would silently break every vector call (wrong dimensions, or no
// embedding model at all) while chat completions looked perfectly healthy. Learning stops; nothing
// reports why.
//
// These tests hold two things in place:
//   1. Default behaviour is UNCHANGED — embeddings follow the reasoner unless deliberately split.
//   2. When split, the embedding endpoint does NOT inherit the reasoner's API key.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_DIMENSIONS,
  embeddingEndpointIsSeparate,
  resolveEmbeddingConfig,
} from '../lib/ai/cos/embeddingEndpoint.ts'

/** Stands in for localInferenceConfigFromEnv()'s output — the reasoner's resolved config. */
const reasonerConfig = {
  baseUrl: 'https://pod-11434.proxy.runpod.net/v1',
  model: 'qwen2.5-coder:32b',
  apiKey: 'reasoner-secret',
  timeoutMs: 120000,
}
const embeddingInferenceConfig = () => resolveEmbeddingConfig(reasonerConfig)

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const BASE = {
  LOCAL_AI_BASE_URL: 'https://pod-11434.proxy.runpod.net/v1',
  LOCAL_AI_MODEL: 'qwen2.5-coder:32b',
  LOCAL_AI_API_KEY: 'reasoner-secret',
  LOCAL_AI_TIMEOUT_MS: '120000',
  LOCAL_AI_EMBEDDING_BASE_URL: undefined,
  LOCAL_AI_EMBEDDING_API_KEY: undefined,
  LOCAL_AI_EMBEDDING_MODEL: undefined,
}

test('the pgvector contract is still 768 dimensions', () => {
  assert.equal(LOCAL_EMBEDDING_DIMENSIONS, 768)
  assert.equal(DEFAULT_LOCAL_EMBEDDING_MODEL, 'nomic-embed-text')
})

test('by default embeddings follow the reasoner — no behaviour change', () => {
  withEnv(BASE, () => {
    const config = embeddingInferenceConfig()
    assert.equal(config.baseUrl, 'https://pod-11434.proxy.runpod.net/v1')
    assert.equal(config.model, 'nomic-embed-text')
    assert.equal(config.apiKey, 'reasoner-secret')
    assert.equal(embeddingEndpointIsSeparate(), false)
  })
})

test('the embedding model is always the embedding model, never the reasoner model', () => {
  withEnv(BASE, () => {
    assert.notEqual(embeddingInferenceConfig().model, 'qwen2.5-coder:32b')
  })
})

test('setting a dedicated base URL moves ONLY embeddings', () => {
  withEnv({ ...BASE, LOCAL_AI_EMBEDDING_BASE_URL: 'https://embeddings.example.com/v1' }, () => {
    const config = embeddingInferenceConfig()
    assert.equal(config.baseUrl, 'https://embeddings.example.com/v1')
    assert.equal(embeddingEndpointIsSeparate(), true)
  })
})

test('a separate embedding host never inherits the reasoner API key', () => {
  // The whole point of splitting is that these are different vendors. Forwarding the reasoner's
  // credential to a third party would leak it.
  withEnv({ ...BASE, LOCAL_AI_EMBEDDING_BASE_URL: 'https://embeddings.example.com/v1' }, () => {
    assert.equal(embeddingInferenceConfig().apiKey, undefined)
  })
})

test('a separate embedding host uses its own key when given one', () => {
  withEnv(
    {
      ...BASE,
      LOCAL_AI_EMBEDDING_BASE_URL: 'https://embeddings.example.com/v1',
      LOCAL_AI_EMBEDDING_API_KEY: 'embedding-secret',
    },
    () => {
      assert.equal(embeddingInferenceConfig().apiKey, 'embedding-secret')
    },
  )
})

test('a trailing slash on the embedding base URL is normalized away', () => {
  withEnv({ ...BASE, LOCAL_AI_EMBEDDING_BASE_URL: 'https://embeddings.example.com/v1/' }, () => {
    assert.equal(embeddingInferenceConfig().baseUrl, 'https://embeddings.example.com/v1')
  })
})

test('an embedding-only key still applies when the endpoint was not split', () => {
  // Same host, different credential — legitimate when one gateway issues per-purpose keys.
  withEnv({ ...BASE, LOCAL_AI_EMBEDDING_API_KEY: 'embedding-secret' }, () => {
    const config = embeddingInferenceConfig()
    assert.equal(config.baseUrl, 'https://pod-11434.proxy.runpod.net/v1')
    assert.equal(config.apiKey, 'embedding-secret')
  })
})
