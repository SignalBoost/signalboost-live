import type { ExactCacheEntry, ExactCacheStore } from '@/lib/cos-core/layers/exact-cache'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'

/**
 * Current facts must be re-verified live on every request. This namespace remains only so old cache
 * rows and old provenance records can be identified; production reads/writes are intentionally
 * disabled. Do not re-enable answer replay here. If evidence retrieval needs caching, cache transport
 * mechanics only within a single request — never a resolved current-fact answer across requests.
 */
export const COS_VOLATILE_CACHE_POLICY_VERSION = 'cos-volatile-live-v3-no-replay'

export type VolatileAnswerCacheValue = {
  reply: string
  groundedAt: string
  liveSources: FreshEvidenceSource[]
  externalProvider: string | null
  externalModel: string | null
}

export type VolatileAnswerCacheHit = {
  value: VolatileAnswerCacheValue
  createdAt: number
  expiresAt: number | null
  ageMs: number
  ttlRemainingMs: number | null
  key: string
}

function normalizePrompt(prompt: string): string {
  return String(prompt || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function volatileAnswerCacheTtlMs(_raw?: string): number {
  return 0
}

export function volatileAnswerCacheKey(input: { prompt: string; language: string }): string {
  return createExactCacheKey({
    taskId: 'cos-volatile-current-fact',
    prompt: normalizePrompt(input.prompt),
    contextFingerprint: `language:${String(input.language || 'en').toLowerCase()}`,
    policyVersion: COS_VOLATILE_CACHE_POLICY_VERSION,
    knowledgeVersion: null,
  })
}

export function volatileCacheEntry(
  value: VolatileAnswerCacheValue,
  now = Date.now(),
  _ttlMs = 0,
): ExactCacheEntry<VolatileAnswerCacheValue> {
  return { value, createdAt: now, expiresAt: now }
}

export async function readVolatileAnswerCache(_input: {
  prompt: string
  language: string
  store?: ExactCacheStore | null
  now?: number
}): Promise<VolatileAnswerCacheHit | null> {
  return null
}

export async function writeVolatileAnswerCache(_input: {
  prompt: string
  language: string
  value: VolatileAnswerCacheValue
  store?: ExactCacheStore | null
  now?: number
  ttlMs?: number
}): Promise<boolean> {
  return false
}

/** Legacy formatter retained for historical provenance records only. */
export function volatileCacheHitProvenance(base: Record<string, any>, hit: VolatileAnswerCacheHit): Record<string, any> {
  const storedAt = new Date(hit.createdAt).toISOString()
  return {
    ...base,
    semantic_cache: { used: false, evidence_count: 0 },
    autonomous_research: { used: false, attempted: false, documents_acquired: 0, new_knowledge_retained: 0 },
    live_external_evidence: { used: false, attempted: false, retrieved_at: null, sources: [] },
    local_reasoning: { ...(base?.local_reasoning || {}), invoked: false, model: null, confidence: null },
    external_ai: { invoked: false, provider: null, model: null },
    volatile_answer_cache: {
      used: true,
      retired: true,
      policy_version: COS_VOLATILE_CACHE_POLICY_VERSION,
      stored_at: storedAt,
      age_ms: hit.ageMs,
      expires_at: hit.expiresAt == null ? null : new Date(hit.expiresAt).toISOString(),
      ttl_remaining_ms: hit.ttlRemainingMs,
      original_grounded_at: hit.value.groundedAt,
      original_external_provider: hit.value.externalProvider,
      original_external_model: hit.value.externalModel,
      origin_live_sources: hit.value.liveSources.map(source => ({ id: source.id, title: source.title, url: source.url })),
    },
    answer_origin: {
      from_cache: true,
      stored_at: storedAt,
      policy_version: COS_VOLATILE_CACHE_POLICY_VERSION,
      model: hit.value.externalModel,
      provider: hit.value.externalProvider,
      original_grounded_at: hit.value.groundedAt,
      live_evidence_sources: hit.value.liveSources.map(source => ({ id: source.id, title: source.title, url: source.url })),
    },
  }
}
