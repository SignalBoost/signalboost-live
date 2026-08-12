// saas/lib/ai/cos/localEmbeddings.ts
//
// THE ONE MISSING PIECE OF AN OTHERWISE COMPLETE SEMANTIC CACHE.
//
// lib/cos-core/layers/knowledge/index.ts (KnowledgeLayer), lib/cos-core/storage/
// supabase.ts (SupabaseKnowledgeStore, pgvector queryNearest via the cos_match_knowledge
// RPC), and the cos_knowledge_records table all already exist and are correct. What was
// missing, confirmed by grep across the whole repo on Aug 12: a concrete
// EmbeddingGenerator — `(text: string) => Promise<number[]>` — was never implemented.
// KnowledgeLayer took it as an injected dependency and nothing ever supplied one, so the
// semantic-cache layer was fully built and never once ran. This is that implementation.
//
// WHY OLLAMA ON THE EXISTING POD, NOT A NEW SERVICE. The reasoner (qwen2.5-coder:32b)
// already runs on RunPod behind an authenticated gateway; Ollama serves an OpenAI-
// compatible /embeddings endpoint on the SAME base URL. One pod, one bill, one auth
// story — no second vendor, no second key, consistent with the repo's settled position
// that Anthropic/OpenAI/Gemini exist only in the external-escalation layer and nowhere
// in what COS calls its own.
//
// WHY THE VECTOR DIMENSION CHANGED FROM 1536 TO 768. The original migration declared
// `vector(1536)` — the OpenAI ada-002/text-embedding-3-small size, presumably assumed
// before a real local embedding model was chosen. nomic-embed-text, the standard Ollama
// embedding model, outputs 768 dimensions. Padding or truncating a vector to fake a
// different size corrupts cosine similarity — it does not make the vectors comparable,
// it makes every comparison wrong. cos_knowledge_records had zero rows (no writer has
// ever run), so the honest fix is to migrate the column to the real model's actual
// output size rather than force the model to lie about its own vectors. See the
// companion migration 20260812_cos_semantic_cache_768.sql.

import { localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import type { EmbeddingGenerator } from '@/lib/cos-core/layers/knowledge/types'

/** nomic-embed-text's real output size. Must match the migrated vector(768) column exactly. */
export const LOCAL_EMBEDDING_DIMENSIONS = 768

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey } : {}
}

function embeddingModel(): string {
  return (process.env.LOCAL_AI_EMBEDDING_MODEL || 'nomic-embed-text').trim()
}

/**
 * Calls the local embedding endpoint on the same pod and host as the reasoner.
 * Deliberately reuses localInferenceConfigFromEnv() for the base URL, API key, and
 * timeout rather than re-parsing LOCAL_AI_BASE_URL itself — the host allowlist, the
 * https-for-remote-hosts rule, and the required-API-key check all live in exactly one
 * place (local-inference.ts) and this file must never grow a second, divergent copy
 * of that security logic.
 *
 * Throws rather than returning null on failure. KnowledgeLayer.lookupSemanticCache
 * and .commitToMemory both wrap this call in their own try/catch and route failures
 * through the injected onError hook — a thrown error there is treated as "no semantic
 * match this time," not a fatal error, so cosFirstAnswer always has a working
 * exact-cache and reasoner path beneath this layer even if the embedding endpoint is
 * unreachable or the pod is stopped.
 */
export const generateLocalEmbedding: EmbeddingGenerator = async (text: string): Promise<number[]> => {
  const config = localInferenceConfigFromEnv()
  const model = embeddingModel()
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
      throw new Error(`localEmbeddings: HTTP ${response.status} — ${await response.text()}`)
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> }
    const vector = data.data?.[0]?.embedding

    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('localEmbeddings: endpoint returned no embedding vector')
    }
    if (vector.length !== LOCAL_EMBEDDING_DIMENSIONS) {
      // A model swap (LOCAL_AI_EMBEDDING_MODEL pointed at something other than
      // nomic-embed-text) that outputs a different size WILL corrupt the pgvector
      // column silently if allowed through — Postgres enforces the declared
      // dimension on insert, so this would otherwise surface as an opaque DB error
      // deep inside KnowledgeLayer.commitToMemory. Fail loudly here instead, with
      // the actual numbers, so the cause is obvious the first time it happens.
      throw new Error(
        `localEmbeddings: model "${model}" returned a ${vector.length}-dimension vector, ` +
          `but cos_knowledge_records.embedding is vector(${LOCAL_EMBEDDING_DIMENSIONS}). ` +
          'Either set LOCAL_AI_EMBEDDING_MODEL back to a 768-dimension model, or run a ' +
          'migration to resize the column and the cos_match_knowledge RPC to match.',
      )
    }

    return vector
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Owner-facing health check, mirroring checkLocalInferenceHealth in local-inference.ts.
 * Confirms the embedding model is actually pulled and reachable — separate from the
 * reasoner's own health check, because the two are different Ollama models and one
 * can be present while the other is not (e.g. right after a fresh pod bootstrap that
 * only pulled the reasoner).
 */
export async function checkLocalEmbeddingHealth(): Promise<{ ok: boolean; model: string; dimensions?: number; error?: string }> {
  const model = embeddingModel()
  try {
    const vector = await generateLocalEmbedding('health check')
    return { ok: true, model, dimensions: vector.length }
  } catch (error) {
    return { ok: false, model, error: error instanceof Error ? error.message : 'Embedding health check failed' }
  }
}
