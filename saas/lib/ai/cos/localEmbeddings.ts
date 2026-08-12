// saas/lib/ai/cos/localEmbeddings.ts
//
// Local semantic-cache embeddings share the same secured Ollama/RunPod endpoint as
// the independent COS reasoner. The pgvector schema is intentionally fixed at 768
// dimensions for nomic-embed-text; model swaps must migrate the database rather than
// pad/truncate vectors and silently corrupt cosine similarity.

import { localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import type { LocalInferenceConfig } from '@/lib/ai/local-inference'
import type { EmbeddingGenerator } from '@/lib/cos-core/layers/knowledge/types'

/** nomic-embed-text's real output size. Must match cos_knowledge_records vector(768). */
export const LOCAL_EMBEDDING_DIMENSIONS = 768
export const DEFAULT_LOCAL_EMBEDDING_MODEL = 'nomic-embed-text'

const DEFAULT_PULL_TIMEOUT_MS = 60_000
const MAX_PULL_TIMEOUT_MS = 90_000
const REPAIR_FAILURE_COOLDOWN_MS = 5 * 60_000

let repairPromise: Promise<void> | null = null
let lastRepairFailureAt = 0

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}
}

function embeddingModel(): string {
  return (process.env.LOCAL_AI_EMBEDDING_MODEL || DEFAULT_LOCAL_EMBEDDING_MODEL).trim()
}

type EmbeddingAttempt =
  | { ok: true; vector: number[] }
  | { ok: false; status: number; body: string }

function validateVector(vector: number[], model: string): number[] {
  if (vector.length !== LOCAL_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `localEmbeddings: model "${model}" returned a ${vector.length}-dimension vector, ` +
        `but cos_knowledge_records.embedding is vector(${LOCAL_EMBEDDING_DIMENSIONS}). ` +
        'Either set LOCAL_AI_EMBEDDING_MODEL back to a 768-dimension model, or run a ' +
        'migration to resize the column and the cos_match_knowledge RPC to match.',
    )
  }
  return vector
}

async function requestEmbedding(text: string, config: LocalInferenceConfig, model: string): Promise<EmbeddingAttempt> {
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
      body: JSON.stringify({ model, input: text }),
    })

    if (!response.ok) {
      return { ok: false, status: response.status, body: await response.text() }
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> }
    const vector = data.data?.[0]?.embedding
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('localEmbeddings: endpoint returned no embedding vector')
    }
    return { ok: true, vector }
  } finally {
    clearTimeout(timeout)
  }
}

function missingModelError(attempt: Extract<EmbeddingAttempt, { ok: false }>, model: string): boolean {
  if (attempt.status !== 404) return false
  const body = attempt.body.toLowerCase()
  return body.includes(model.toLowerCase()) && (body.includes('model') && (body.includes('not found') || body.includes('pulling it')))
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
    throw new Error('localEmbeddings: automatic model repair requires an Ollama OpenAI-compatible base URL ending in /v1')
  }
  url.pathname = url.pathname.replace(/\/v1\/?$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
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
 * Generate a local semantic-cache vector. If the secured RunPod/Ollama endpoint
 * reports that the configured embedding model is missing, repair that exact missing
 * model once through Ollama's authenticated native /api/pull endpoint and retry.
 *
 * This repair is deliberately narrow:
 * - only an HTTP 404 that names the configured model can trigger it;
 * - by default it is enabled only for the HTTPS RunPod proxy shape used by COS;
 * - LOCAL_AI_EMBEDDING_AUTO_REPAIR=false disables it;
 * - failed pulls enter a five-minute process-local cooldown instead of stalling every turn;
 * - no external AI provider is involved.
 */
export const generateLocalEmbedding: EmbeddingGenerator = async (text: string): Promise<number[]> => {
  const config = localInferenceConfigFromEnv()
  const model = embeddingModel()
  let attempt = await requestEmbedding(text, config, model)

  if (!attempt.ok && missingModelError(attempt, model) && runpodAutoRepairEnabled(config)) {
    await pullEmbeddingModel(config, model)
    attempt = await requestEmbedding(text, config, model)
  }

  if (!attempt.ok) {
    throw new Error(`localEmbeddings: HTTP ${attempt.status} — ${attempt.body}`)
  }

  return validateVector(attempt.vector, model)
}

/**
 * Read-only owner health check. It intentionally does NOT auto-pull a missing model;
 * GET health endpoints must report state rather than mutate it. Normal semantic-cache
 * traffic repairs the known RunPod missing-model case, and the bootstrap script also
 * pulls the embedding model into persistent /workspace storage.
 */
export async function checkLocalEmbeddingHealth(): Promise<{ ok: boolean; model: string; dimensions?: number; error?: string }> {
  const model = embeddingModel()
  try {
    const config = localInferenceConfigFromEnv()
    const attempt = await requestEmbedding('health check', config, model)
    if (!attempt.ok) return { ok: false, model, error: `HTTP ${attempt.status} — ${attempt.body}` }
    const vector = validateVector(attempt.vector, model)
    return { ok: true, model, dimensions: vector.length }
  } catch (error) {
    return { ok: false, model, error: error instanceof Error ? error.message : 'Embedding health check failed' }
  }
}
