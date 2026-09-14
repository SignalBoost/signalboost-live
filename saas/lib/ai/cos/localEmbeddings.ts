// saas/lib/ai/cos/localEmbeddings.ts
//
// Provider-selection wrapper for the mature embedding engine.
//
// The previous implementation is preserved byte-for-byte in localEmbeddingsLegacy.ts and remains
// the managed/fallback engine. This wrapper adds an explicitly configured RunPod primary without
// repointing LOCAL_AI_BASE_URL or LOCAL_AI_EMBEDDING_BASE_URL, so DeepInfra remains reachable when
// owned compute is cold or unavailable.
//
// Vector-space safety is stricter than dimension safety: the RunPod primary is eligible only when
// RUNPOD_PRIMARY_EMBEDDING_MODEL exactly equals LOCAL_AI_EMBEDDING_MODEL. Two unrelated 768-wide
// models are not interchangeable and must never share one pgvector corpus without a full re-index.

import { createHash } from 'node:crypto'
import { ensureLocalInferenceRuntimeReady, localInferenceConfigFromEnv } from '../local-inference.ts'
import type { LocalInferenceConfig } from '../local-inference.ts'
import {
  embeddingModelName,
  resolveRunpodPrimaryEmbeddingConfig,
  type RunpodEmbeddingPrimaryResolution,
} from './embeddingEndpoint.ts'
import * as fallbackEngine from './localEmbeddingsLegacy.ts'

export const LOCAL_EMBEDDING_DIMENSIONS = fallbackEngine.LOCAL_EMBEDDING_DIMENSIONS
export const DEFAULT_LOCAL_EMBEDDING_MODEL = fallbackEngine.DEFAULT_LOCAL_EMBEDDING_MODEL
export const embeddingEndpointIsSeparate = fallbackEngine.embeddingEndpointIsSeparate
export const embeddingInferenceConfig = fallbackEngine.embeddingInferenceConfig

const DEFAULT_FOREGROUND_QUERY_CACHE_TTL_MS = 30_000
const MAX_FOREGROUND_QUERY_CACHE_ENTRIES = 64

let lastPrimaryConfigurationWarning = ''

type ForegroundEmbeddingCacheEntry = {
  promise: Promise<number[]>
  expiresAt: number | null
}

const foregroundQueryEmbeddingCache = new Map<string, ForegroundEmbeddingCacheEntry>()

type PrimaryEmbeddingAttempt = Readonly<{
  vectors: number[][] | null
  attempted: boolean
  reason: string
  error: string | null
}>

function foregroundQueryCacheTtlMs(): number {
  const value = Number(process.env.COS_FOREGROUND_EMBEDDING_CACHE_TTL_MS || String(DEFAULT_FOREGROUND_QUERY_CACHE_TTL_MS))
  if (!Number.isFinite(value)) return DEFAULT_FOREGROUND_QUERY_CACHE_TTL_MS
  return Math.max(5_000, Math.min(120_000, Math.round(value)))
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

function primaryResolution(): { fallback: LocalInferenceConfig; primary: RunpodEmbeddingPrimaryResolution } {
  const fallback = embeddingInferenceConfig()
  return {
    fallback,
    primary: resolveRunpodPrimaryEmbeddingConfig(fallback),
  }
}

/** Owner/diagnostic read of the safe primary decision. Contains no credential value. */
export function runpodPrimaryEmbeddingResolution(): Omit<RunpodEmbeddingPrimaryResolution, 'config'> & {
  configured: boolean
  baseUrl: string | null
} {
  const { primary } = primaryResolution()
  return {
    reason: primary.reason,
    expectedModel: primary.expectedModel,
    configuredModel: primary.configuredModel,
    configured: Boolean(primary.config),
    baseUrl: primary.config?.baseUrl || null,
  }
}

function warnPrimaryConfiguration(primary: RunpodEmbeddingPrimaryResolution): void {
  if (primary.reason === 'ready' || primary.reason === 'not_configured') return
  const key = `${primary.reason}:${primary.expectedModel}:${primary.configuredModel || ''}`
  if (lastPrimaryConfigurationWarning === key) return
  lastPrimaryConfigurationWarning = key
  console.warn('[cos-embedding-primary-disabled]', JSON.stringify({
    provider: 'runpod',
    reason: primary.reason,
    expectedModel: primary.expectedModel,
    configuredModel: primary.configuredModel,
    fallbackPreserved: true,
  }))
}

function validatePrimaryVectors(vectors: number[][], expectedCount: number, model: string): number[][] {
  if (vectors.length !== expectedCount) {
    throw new Error(`RunPod embedding primary returned ${vectors.length} vectors for ${expectedCount} inputs`)
  }
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== LOCAL_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `RunPod embedding primary model "${model}" returned ${Array.isArray(vector) ? vector.length : 0} dimensions; ` +
        `expected ${LOCAL_EMBEDDING_DIMENSIONS}`,
      )
    }
  }
  return vectors
}

async function requestRunpodPrimaryEmbeddings(
  texts: string[],
  config: LocalInferenceConfig,
): Promise<number[][]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? {
          Authorization: `Bearer ${config.apiKey}`,
          'x-api-key': config.apiKey,
        } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        input: texts.length === 1 ? texts[0] : texts,
      }),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const body = await response.json() as { data?: Array<{ embedding?: number[]; index?: number }> }
    const items = Array.isArray(body.data) ? body.data : []
    const ordered = [...items].sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
    const vectors = ordered.map(item => Array.isArray(item.embedding) ? item.embedding : [])
    return validatePrimaryVectors(vectors, texts.length, config.model)
  } finally {
    clearTimeout(timeout)
  }
}

async function tryRunpodPrimaryEmbeddings(texts: string[]): Promise<PrimaryEmbeddingAttempt> {
  const { fallback, primary } = primaryResolution()
  warnPrimaryConfiguration(primary)
  if (!primary.config) {
    return { vectors: null, attempted: false, reason: primary.reason, error: null }
  }

  // A primary that resolves to the same endpoint as fallback is not redundancy. Skip it so one
  // failing service is not called twice and mislabeled as a successful failover design.
  if (primary.config.baseUrl.toLowerCase() === fallback.baseUrl.toLowerCase()) {
    return { vectors: null, attempted: false, reason: 'same_endpoint_as_fallback', error: null }
  }

  const startedAt = Date.now()
  try {
    const vectors = await requestRunpodPrimaryEmbeddings(texts, primary.config as LocalInferenceConfig)
    console.info('[cos-embedding-route]', JSON.stringify({
      provider: 'runpod',
      routeOwner: 'itmounts',
      model: primary.config.model,
      primary: true,
      success: true,
      fallbackFromOwned: false,
      inputCount: texts.length,
      latencyMs: Date.now() - startedAt,
    }))
    return { vectors, attempted: true, reason: 'runpod_primary_success', error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'runpod_embedding_primary_failed'
    console.warn('[cos-embedding-route]', JSON.stringify({
      provider: 'runpod',
      routeOwner: 'itmounts',
      model: primary.config.model,
      primary: true,
      success: false,
      fallbackFromOwned: false,
      inputCount: texts.length,
      latencyMs: Date.now() - startedAt,
      error: message.slice(0, 200),
    }))
    return { vectors: null, attempted: true, reason: 'runpod_primary_failed', error: message }
  }
}

function fallbackProvider(config: LocalInferenceConfig): string {
  try {
    const host = new URL(config.baseUrl).hostname.toLowerCase()
    if (host === 'api.deepinfra.com' || host.endsWith('.deepinfra.com')) return 'deepinfra'
    return 'managed_fallback'
  } catch {
    return 'managed_fallback'
  }
}

/**
 * Passive batch API. Explicit RunPod primary is tried first; every primary failure uses the mature
 * managed embedding engine. This function never wakes the fixed RunPod pod itself.
 */
export async function generateLocalEmbeddings(texts: string[]): Promise<number[][]> {
  const normalized = texts.map(text => String(text ?? '').trim())
  if (normalized.length === 0) return []

  const primary = await tryRunpodPrimaryEmbeddings(normalized)
  if (primary.vectors) return primary.vectors.map(vector => [...vector])

  const startedAt = Date.now()
  const fallback = embeddingInferenceConfig()
  const vectors = await fallbackEngine.generateLocalEmbeddings(normalized)
  if (primary.attempted) {
    console.info('[cos-embedding-route]', JSON.stringify({
      provider: fallbackProvider(fallback),
      routeOwner: 'external',
      model: embeddingModelName(),
      primary: false,
      success: true,
      fallbackFromOwned: true,
      primaryFailure: primary.reason,
      inputCount: normalized.length,
      latencyMs: Date.now() - startedAt,
    }))
  }
  return vectors
}

/** Foreground lifecycle-aware batch embedding path. */
export async function generateReadyLocalEmbeddings(texts: string[]): Promise<number[][]> {
  const normalized = texts.map(text => String(text ?? '').trim())
  if (normalized.length === 0) return []
  if (process.env.COS_LOCAL_FIRST_ENABLED === 'false') {
    throw new Error('localEmbeddings: COS local-first is disabled by COS_LOCAL_FIRST_ENABLED')
  }

  const { primary } = primaryResolution()
  // An explicitly configured RunPod embedding primary is responsible for its own Serverless/fixed
  // endpoint readiness. Do not wake the text-reasoner pod merely to prepare an embedding request.
  if (primary.config || primary.reason !== 'not_configured') {
    return generateLocalEmbeddings(normalized)
  }

  // Preserve the existing fallback-only behavior exactly when no primary has been configured.
  const config = localInferenceConfigFromEnv()
  if (!embeddingEndpointIsSeparate()) {
    await ensureLocalInferenceRuntimeReady(config)
  }
  return generateLocalEmbeddings(normalized)
}

function foregroundQueryCacheKey(text: string): string {
  const { fallback, primary } = primaryResolution()
  const endpoint = primary.config?.baseUrl || fallback.baseUrl
  return createHash('sha256')
    .update([endpoint.toLowerCase(), embeddingModelName(), text].join('\n'))
    .digest('hex')
}

/** Canonical foreground embedding API used by interactive COS retrieval. */
export const generateLocalEmbedding = async (text: string): Promise<number[]> => {
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
    return [...await existing.promise]
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

  return [...await promise]
}

/** Passive single-vector API for background persistence/backfill. It never changes lifecycle state. */
export const generatePassiveLocalEmbedding = async (text: string): Promise<number[]> => {
  const [vector] = await generateLocalEmbeddings([text])
  if (!vector) throw new Error('localEmbeddings: endpoint returned no embedding vector')
  return vector
}

/** Backward-compatible explicit name for callers that want readiness intent to be obvious. */
export const generateReadyLocalEmbedding = generateLocalEmbedding

type EmbeddingHealth = {
  ok: boolean
  model: string
  dimensions?: number
  error?: string
  route?: 'runpod' | 'fallback'
  primaryError?: string
}

/** Read-only owner health check. It never starts or repairs primary compute. */
export async function checkLocalEmbeddingHealth(): Promise<EmbeddingHealth> {
  const model = embeddingModelName()
  const primary = await tryRunpodPrimaryEmbeddings(['health check'])
  if (primary.vectors?.[0]) {
    return { ok: true, model, dimensions: primary.vectors[0].length, route: 'runpod' }
  }

  const fallback = await fallbackEngine.checkLocalEmbeddingHealth()
  if (fallback.ok) {
    return {
      ...fallback,
      route: 'fallback',
      ...(primary.attempted && primary.error ? { primaryError: primary.error } : {}),
    }
  }
  return {
    ...fallback,
    ...(primary.attempted && primary.error ? {
      error: `${primary.error}; fallback: ${fallback.error || 'unavailable'}`,
      primaryError: primary.error,
    } : {}),
  }
}
