import type { ExactCacheEntry, ExactCacheStore } from '@/lib/cos-core/layers/exact-cache'
import { createExactCacheKey } from '@/lib/cos-core/layers/exact-cache'
import { SupabaseExactCacheStore } from '@/lib/cos-core/storage/exactSupabase'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'

export const COS_VOLATILE_CACHE_POLICY_VERSION = 'cos-volatile-live-v3'
const DEFAULT_TTL_MS = 60 * 60 * 1000
const MIN_TTL_MS = 60 * 1000
const MAX_TTL_MS = 24 * 60 * 60 * 1000

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

export function volatileAnswerCacheTtlMs(raw = process.env.COS_VOLATILE_ANSWER_CACHE_TTL_MS): number {
  const value = Number(raw || DEFAULT_TTL_MS)
  if (!Number.isFinite(value)) return DEFAULT_TTL_MS
  return Math.max(MIN_TTL_MS, Math.min(MAX_TTL_MS, Math.floor(value)))
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

function productionStore(): ExactCacheStore | null {
  const db = cosServiceDb()
  return db ? new SupabaseExactCacheStore(db) : null
}

export function volatileCacheEntry(
  value: VolatileAnswerCacheValue,
  now = Date.now(),
  ttlMs = volatileAnswerCacheTtlMs(),
): ExactCacheEntry<VolatileAnswerCacheValue> {
  return { value, createdAt: now, expiresAt: now + ttlMs }
}

export async function readVolatileAnswerCache(input: {
  prompt: string
  language: string
  store?: ExactCacheStore | null
  now?: number
}): Promise<VolatileAnswerCacheHit | null> {
  const store = input.store === undefined ? productionStore() : input.store
  if (!store) return null
  const key = volatileAnswerCacheKey(input)
  try {
    const entry = await store.get<VolatileAnswerCacheValue>(key)
    if (!entry) return null
    const now = input.now ?? Date.now()
    return {
      value: entry.value,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      ageMs: Math.max(0, now - entry.createdAt),
      ttlRemainingMs: entry.expiresAt == null ? null : Math.max(0, entry.expiresAt - now),
      key,
    }
  } catch (error) {
    console.error('[cos-volatile-cache-read-error]', error)
    return null
  }
}

export async function writeVolatileAnswerCache(input: {
  prompt: string
  language: string
  value: VolatileAnswerCacheValue
  store?: ExactCacheStore | null
  now?: number
  ttlMs?: number
}): Promise<boolean> {
  const store = input.store === undefined ? productionStore() : input.store
  if (!store) return false
  const key = volatileAnswerCacheKey(input)
  try {
    await store.set(key, volatileCacheEntry(input.value, input.now ?? Date.now(), input.ttlMs ?? volatileAnswerCacheTtlMs()))
    return true
  } catch (error) {
    console.error('[cos-volatile-cache-write-error]', error)
    return false
  }
}

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
