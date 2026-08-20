// saas/lib/ai/cos/localEmbeddings.ts
//
// Semantic-cache embeddings. The pgvector schema is intentionally fixed at 768 dimensions for
// nomic-embed-text; model swaps must migrate the database rather than pad/truncate vectors and
// silently corrupt cosine similarity.
//
// EMBEDDINGS NO LONGER RIDE THE REASONER'S ENDPOINT BY FORCE (Aug 20 2026).
//
// They used to: this module called localInferenceConfigFromEnv() directly, so LOCAL_AI_BASE_URL
// pointed both the reasoner and the embedder at the same host. That coupling is a trap during any
// provider migration — repoint LOCAL_AI_BASE_URL at a per-token inference host that serves chat
// models but no 768-dimension embedding model, and completions look perfectly healthy while every
// embedding call fails validateVector(). The semantic cache and learned-corpus retrieval stop
// working, which means LEARNING stops working, with no error anywhere near the actual cause.
//
// The two workloads have genuinely different requirements and belong on separate dials:
//   - the reasoner is swappable by design; the whole point is that any capable model can serve it
//   - the embedder is PINNED by the database — 768 dims, or migrate and re-embed the corpus
//
// So embeddings now resolve their own endpoint via embeddingInferenceConfig(), which falls back to
// the reasoner's config when unset. Behaviour is IDENTICAL until someone sets the new variables,
// so this is a no-op for the current deployment and an escape hatch for the migration.

import { createHash } from 'node:crypto'
import { ensureLocalInferenceRuntimeReady, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import type { LocalInferenceConfig } from '@/lib/ai/local-inference'
import type { EmbeddingGenerator } from '@/lib/cos-core/layers/knowledge/types'
import {
  LOCAL_EMBEDDING_DIMENSIONS as EMBEDDING_DIMENSIONS,
  embeddingEndpointIsSeparate as isSeparateEmbeddingEndpoint,
  embeddingModelName,
  resolveEmbeddingConfig,
} from '@/lib/ai/cos/embeddingEndpoint'

// Re-exported so existing importers keep working; the definitions live in the alias-free module
// so they can be unit-tested without the Next.js path alias.
export { LOCAL_EMBEDDING_DIMENSIONS, DEFAULT_LOCAL_EMBEDDING_MODEL, embeddingEndpointIsSeparate } from '@/lib/ai/cos/embeddingEndpoint'

const DEFAULT_PULL_TIMEOUT_MS = 60_000
const MAX_PULL_TIMEOUT_MS = 90_000
const REPAIR_FAILURE_COOLDOWN_MS = 5 * 60_000
const DEFAULT_FOREGROUND_QUERY_CACHE_TTL_MS = 30_000
const MAX_FOREGROUND_QUERY_CACHE_ENTRIES = 64

let repairPromise: Promise<void> | null = null
let lastRepairFailureAt = 0

type ForegroundEmbeddingCacheEntry = {
  promise: Promise<number[]>
  expiresAt: number | null
}

const foregroundQueryEmbeddingCache = new Map<string, ForegroundEmbeddingCacheEntry>()

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}
}

function embeddingModel(): string {
  return embeddingModelName()
}

/**
 * Where embedding requests go. Defaults to the reasoner's endpoint so nothing changes until
 * LOCAL_AI_EMBEDDING_BASE_URL is set. Decision logic lives in embeddingEndpoint.ts (alias-free,
 * unit-tested); this only supplies the reasoner config it builds on.
 */
export function embeddingInferenceConfig(): LocalInferenceConfig {
  return resolveEmbeddingConfig(localInferenceConfigFromEnv())
}

function foregroundQueryCacheTtlMs(): number {
  const value = Number(process.env.COS_FOREGROUND_EMBEDDING_CACHE_TTL_MS || String(DEFAULT_FOREGROUND_QUERY_CACHE_TTL_MS))
  if (!Number.isFinite(value)) return DEFAULT_FOREGROUND_QUERY_CACHE_TTL_MS
  return Math.max(5_000, Math.min(120_000, Math.round(value)))
}

function foregroundQueryCacheKey(text: string): string {
  return createHash('sha256')
    .update([
      // The EMBEDDING endpoint, not the reasoner's — otherwise moving the reasoner would silently
      // invalidate (or worse, wrongly reuse) cached vectors produced by a different embedder.
      embeddingInferenceConfig().baseUrl.toLowerCase(),
      embeddingModel(),
      text,
    ].join('\n'))
    .digest('hex')
}

function pruneForegroundQueryCache(now = Date.now()): void {
  for (const [key, entry] of foregroundQueryEmbeddingCache) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) foregroundQueryEmbeddingCache.delete(key)
  }
  if (foregroundQueryEmbeddingCache.size < MAX_FOREGROUND_QUERY_CACHE_ENTRIES) return
  for (const [key, entry] of foregroundQueryEmbeddingCache) {
    if (entry.expiresAt === null) continue
    foregroundQueryEmbeddingCache.delete(key)
    if (foregroundQueryEmbeddingCache.size < MAX_FOREGROUND_QUERY_CACHE_ENTRIES) break
  }
}

type EmbeddingAttempt =
  | { ok: true; vectors: number[][] }
  | { ok: false; status: number; body: string }

type EmbeddingFailure = Extract<EmbeddingAttempt, { ok: false }>
type EmbeddingTransport = 'openai' | 'native'

function validateVector(vector: number[], model: string): number[] {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `localEmbeddings: model "${model}" returned a ${vector.length}-dimension vector, ` +
        `but cos_knowledge_records.embedding is vector(${EMBEDDING_DIMENSIONS}). ` +
        'Either set LOCAL_AI_EMBEDDING_MODEL back to a 768-dimension model, or run a ' +
        'migration to resize the column and the cos_match_knowledge RPC to match.',
    )
  }
  return vector
}

async function requestEmbeddings(texts: string[], config: LocalInferenceConfig, model: string): Promise<EmbeddingAttempt> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(config.apiKey),
      },
      signal: controller.signal,
      body: JSON.stringify({ model, input: texts.length === 1 ? texts[0] : texts }),
    })

    if (!response.ok) {
      return { ok: false, status: response.status, body: await response.text() }
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[]; index?: number }> }
    const items = Array.isArray(data.data) ? data.data : []
    if (items.length !== texts.length) {
      throw new Error(`localEmbeddings: endpoint returned ${items.length} vectors for ${texts.length} inputs`)
    }

    const ordered = [...items].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
    const vectors = ordered.map(item => item.embedding)
    if (vectors.some(vector => !Array.isArray(vector) || vector.length === 0)) {
      throw new Error('localEmbeddings: endpoint returned an empty embedding vector')
    }
    return { ok: true, vectors: vectors as number[][] }
  } finally {
    clearTimeout(timeout)
  }
}

function missingModelError(attempt: EmbeddingAttempt, model: string): boolean {
  if (!('status' in attempt) || attempt.status !== 404) return false
  const body = attempt.body.toLowerCase()
  return body.includes(model.toLowerCase()) && body.includes('model') && (body.includes('not found') || body.includes('pulling it'))
}

function runpodAutoRepairEnabled(config: LocalInferenceConfig): boolean {
  const override = process.env.LOCAL_AI_EMBEDDING_AUTO_REPAIR?.trim().toLowerCase()
  if (override === 'false') return false
  if (override === 'true') return true
  try {
    const url = new URL(config.baseUrl)
    return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.proxy.runpod.net') && /\/v1\/?$/.test(url.pathname)
  } catch {
    return false
  }
}

function ollamaNativeBaseUrl(config: LocalInferenceConfig): string {
  const url = new URL(config.baseUrl)
  if (!/\/v1\/?$/.test(url.pathname)) {
    throw new Error('localEmbeddings: native Ollama compatibility requires a base URL ending in /v1')
  }
  url.pathname = url.pathname.replace(/\/v1\/?$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function ollamaNativeFallbackEligible(config: LocalInferenceConfig): boolean {
  try {
    return /\/v1\/?$/.test(new URL(config.baseUrl).pathname)
  } catch {
    return false
  }
}

async function requestNativeEmbeddings(texts: string[], config: LocalInferenceConfig, model: string): Promise<EmbeddingAttempt> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${ollamaNativeBaseUrl(config)}/api/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(config.apiKey),
      },
      signal: controller.signal,
      body: JSON.stringify({ model, input: texts.length === 1 ? texts[0] : texts }),
    })

    if (!response.ok) {
      return { ok: false, status: response.status, body: await response.text() }
    }

    const data = await response.json() as { embeddings?: number[][] }
    const vectors = Array.isArray(data.embeddings) ? data.embeddings : []
    if (vectors.length !== texts.length) {
      throw new Error(`localEmbeddings: native endpoint returned ${vectors.length} vectors for ${texts.length} inputs`)
    }
    if (vectors.some(vector => !Array.isArray(vector) || vector.length === 0)) {
      throw new Error('localEmbeddings: native endpoint returned an empty embedding vector')
    }
    return { ok: true, vectors }
  } finally {
    clearTimeout(timeout)
  }
}

function openAiEmbeddingEndpointUnavailable(
  attempt: EmbeddingAttempt,
  config: LocalInferenceConfig,
  model: string,
): attempt is EmbeddingFailure {
  return 'status' in attempt
    && attempt.status === 404
    && !missingModelError(attempt, model)
    && ollamaNativeFallbackEligible(config)
}

async function requestCompatibleEmbeddings(
  texts: string[],
  config: LocalInferenceConfig,
  model: string,
): Promise<{ attempt: EmbeddingAttempt; transport: EmbeddingTransport }> {
  const openAiAttempt = await requestEmbeddings(texts, config, model)
  if (!openAiEmbeddingEndpointUnavailable(openAiAttempt, config, model)) {
    return { attempt: openAiAttempt, transport: 'openai' }
  }

  console.info('[cos-embedding-transport-fallback]', JSON.stringify({
    at: new Date().toISOString(),
    from: 'openai_v1_embeddings',
    to: 'ollama_native_api_embed',
    status: openAiAttempt.status,
  }))
  return {
    attempt: await requestNativeEmbeddings(texts, config, model),
    transport: 'native',
  }
}

function pullTimeoutMs(): number {
  const configured = Number(process.env.LOCAL_AI_EMBEDDING_PULL_TIMEOUT_MS || String(DEFAULT_PULL_TIMEOUT_MS))
  if (!Number.isFinite(configured)) return DEFAULT_PULL_TIMEOUT_MS
  return Math.max(5_000, Math.min(MAX_PULL_TIMEOUT_MS, configured))
}

async function pullEmbeddingModel(config: LocalInferenceConfig, model: string): Promise<void> {
  if (lastRepairFailureAt && Date.now() - lastRepairFailureAt < REPAIR_FAILURE_COOLDOWN_MS) {
    throw new Error('localEmbeddings: automatic embedding-model repair is cooling down after a recent failed pull')
  }
  if (repairPromise) return repairPromise

  repairPromise = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), pullTimeoutMs())
    try {
      const response = await fetch(`${ollamaNativeBaseUrl(config)}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(config.apiKey),
        },
        signal: controller.signal,
        body: JSON.stringify({ model, stream: false }),
      })
      const body = await response.text()
      if (!response.ok) {
        throw new Error(`localEmbeddings: Ollama model pull failed with HTTP ${response.status} — ${body}`)
      }
      lastRepairFailureAt = 0
      console.info('[cos-embedding-repair]', JSON.stringify({ at: new Date().toISOString(), model, repaired: true }))
    } catch (error) {
      lastRepairFailureAt = Date.now()
      console.error('localEmbeddings: automatic embedding-model repair failed', error)
      throw error
    } finally {
      clearTimeout(timeout)
    }
  })()

  try {
    await repairPromise
  } finally {
    repairPromise = null
  }
}

/**
 * Generate one or more local semantic vectors in a SINGLE embeddings request.
 *
 * This base function intentionally does NOT change RunPod lifecycle state. Background learning,
 * embed-on-write and backfill jobs can use it and fail soft while the GPU is stopped rather than
 * allocating compute merely to fill vectors.
 */
export async function generateLocalEmbeddings(texts: string[]): Promise<number[][]> {
  const normalized = texts.map(text => String(text ?? '').trim())
  if (normalized.length === 0) return []
  const config = embeddingInferenceConfig()
  const model = embeddingModel()
  let { attempt, transport } = await requestCompatibleEmbeddings(normalized, config, model)

  if ('status' in attempt && missingModelError(attempt, model) && runpodAutoRepairEnabled(config)) {
    await pullEmbeddingModel(config, model)
    if (transport === 'native') {
      attempt = await requestNativeEmbeddings(normalized, config, model)
    } else {
      const retried = await requestCompatibleEmbeddings(normalized, config, model)
      attempt = retried.attempt
      transport = retried.transport
    }
  }

  if ('status' in attempt) {
    throw new Error(`localEmbeddings: HTTP ${attempt.status} — ${attempt.body}`)
  }

  return attempt.vectors.map(vector => validateVector(vector, model))
}

/** Foreground lifecycle-aware batch embedding path. */
export async function generateReadyLocalEmbeddings(texts: string[]): Promise<number[][]> {
  const normalized = texts.map(text => String(text ?? '').trim())
  if (normalized.length === 0) return []
  if (process.env.COS_LOCAL_FIRST_ENABLED === 'false') {
    throw new Error('localEmbeddings: COS local-first is disabled by COS_LOCAL_FIRST_ENABLED')
  }
  // Readiness (RunPod wake) only applies to a self-hosted pod. When embeddings live on a managed
  // endpoint there is nothing to wake, and calling this would fail on the wake-permission gate.
  if (!isSeparateEmbeddingEndpoint()) {
    await ensureLocalInferenceRuntimeReady(localInferenceConfigFromEnv())
  }
  return generateLocalEmbeddings(normalized)
}

/**
 * Canonical foreground embedding API used by interactive COS retrieval.
 * Identical foreground query vectors are shared while in flight and retained briefly after success.
 * This lets the ordinary COS preflight warm one embedding outside bounded KG/corpus retrieval timers,
 * then lets both semantic stores reuse that exact vector without duplicate model work. The cache key
 * is hashed so raw prompt text is not retained as a Map key, and passive/background APIs do not use it.
 */
export const generateLocalEmbedding: EmbeddingGenerator = async (text: string): Promise<number[]> => {
  const normalized = String(text ?? '').trim()
  if (!normalized) throw new Error('localEmbeddings: foreground embedding text is empty')
  if (process.env.COS_LOCAL_FIRST_ENABLED === 'false') {
    throw new Error('localEmbeddings: COS local-first is disabled by COS_LOCAL_FIRST_ENABLED')
  }

  const now = Date.now()
  pruneForegroundQueryCache(now)
  const key = foregroundQueryCacheKey(normalized)
  const existing = foregroundQueryEmbeddingCache.get(key)
  if (existing && (existing.expiresAt === null || existing.expiresAt > now)) {
    const vector = await existing.promise
    return [...vector]
  }
  if (existing) foregroundQueryEmbeddingCache.delete(key)

  const promise = (async () => {
    const [vector] = await generateReadyLocalEmbeddings([normalized])
    if (!vector) throw new Error('localEmbeddings: ready endpoint returned no embedding vector')
    return vector
  })()
  const entry: ForegroundEmbeddingCacheEntry = { promise, expiresAt: null }
  foregroundQueryEmbeddingCache.set(key, entry)

  void promise.then(
    () => {
      if (foregroundQueryEmbeddingCache.get(key) !== entry) return
      entry.expiresAt = Date.now() + foregroundQueryCacheTtlMs()
      pruneForegroundQueryCache()
    },
    () => {
      if (foregroundQueryEmbeddingCache.get(key) === entry) foregroundQueryEmbeddingCache.delete(key)
    },
  )

  const vector = await promise
  return [...vector]
}

/** Passive single-vector API for background persistence/backfill. It never changes lifecycle state. */
export const generatePassiveLocalEmbedding: EmbeddingGenerator = async (text: string): Promise<number[]> => {
  const [vector] = await generateLocalEmbeddings([text])
  if (!vector) throw new Error('localEmbeddings: endpoint returned no embedding vector')
  return vector
}

/** Backward-compatible explicit name for callers that want readiness intent to be obvious. */
export const generateReadyLocalEmbedding: EmbeddingGenerator = generateLocalEmbedding

/**
 * Read-only owner health check. It intentionally does NOT auto-pull a missing model;
 * GET health endpoints must report state rather than mutate it. Normal semantic-cache
 * traffic repairs the known RunPod missing-model case, and the bootstrap script also
 * pulls the embedding model into persistent /workspace storage.
 */
export async function checkLocalEmbeddingHealth(): Promise<{ ok: boolean; model: string; dimensions?: number; error?: string }> {
  const model = embeddingModel()
  try {
    const config = embeddingInferenceConfig()
    const { attempt } = await requestCompatibleEmbeddings(['health check'], config, model)
    if ('status' in attempt) return { ok: false, model, error: `HTTP ${attempt.status} — ${attempt.body}` }
    const vector = validateVector(attempt.vectors[0] ?? [], model)
    return { ok: true, model, dimensions: vector.length }
  } catch (error) {
    return { ok: false, model, error: error instanceof Error ? error.message : 'Embedding health check failed' }
  }
}
