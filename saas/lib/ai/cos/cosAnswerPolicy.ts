//
// WHY THIS FILE EXISTS.
//
// A confident semantic-cache answer can outlive the runtime that produced it. The cache partition
// therefore describes both the answer-generation policy AND the embedding vector space used to
// find similar prompts. Two embedding models may both return 768 dimensions while producing
// incompatible coordinate spaces; dimensional equality is not semantic compatibility.
//
// cos_match_knowledge already filters by task_id, so the policy fingerprint partitions old rows
// without destructive cleanup. A reasoner-model, system-prompt, confidence-gate, manual policy, or
// embedding-model change makes older cache vectors unreachable by construction.
//
// Cache entries are also revalidated against the CURRENT answer-side freshness/integrity policy
// before replay. This prevents an answer generated under an older guard from bypassing a newer
// output-safety rule merely because its cache stamp still matches.

import { createHash } from 'node:crypto'
import { answerNeedsFreshnessReflection } from './answerFreshnessSelfReflection.ts'

// 2026-08-25: v10 adds general quantitative/engineering integrity. Bump the fingerprint so answers
// cached before assumption-promotion, entity-count, and distributed-checkpoint guards cannot replay.
export const COS_ANSWER_GATE_REVISION = '2026-08-25.cache-replay-output-gate.v10-quant-engineering-integrity'

export type CosAnswerPolicyInputs = {
  reasonerSystemPrompt: string
  model: string | null
  threshold: number
  /** Embedding model used by semantic-cache vectors. Defaults to LOCAL_AI_EMBEDDING_MODEL. */
  embeddingModel?: string | null
  gateRevision?: string
}

export function cosAnswerPolicyVersion(inputs: CosAnswerPolicyInputs): string {
  const embeddingModel = String(inputs.embeddingModel ?? process.env.LOCAL_AI_EMBEDDING_MODEL ?? '').trim().toLowerCase()
  const payload = JSON.stringify({
    prompt: String(inputs.reasonerSystemPrompt || ''),
    model: String(inputs.model || '').trim().toLowerCase(),
    threshold: Number(inputs.threshold).toFixed(2),
    gate: inputs.gateRevision ?? COS_ANSWER_GATE_REVISION,
    ...(embeddingModel ? { embeddingModel } : {}),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

export function cosCacheTaskId(baseTaskId: string, policyVersion: string): string {
  return `${baseTaskId}@${policyVersion}`
}

export function cosCacheMaxAgeMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.COS_ANSWER_CACHE_MAX_AGE_MS
  if (raw === undefined || raw === '') return 7 * 24 * 60 * 60 * 1000
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : 7 * 24 * 60 * 60 * 1000
}

export type CachedAnswerStamp = {
  policyVersion?: string | null
  storedAt?: string | null
  reply?: string | null
}

export function cachedAnswerIsCurrent(
  entry: CachedAnswerStamp | null | undefined,
  policyVersion: string,
  maxAgeMs: number,
  now: number = Date.now(),
): { ok: true; reason?: undefined } | { ok: false; reason: string } {
  if (!entry) return { ok: false, reason: 'no cached entry' }
  const stamped = entry.policyVersion ? String(entry.policyVersion) : null
  if (!stamped) return { ok: false, reason: 'cached answer predates answer-policy versioning' }
  if (stamped !== policyVersion) {
    return { ok: false, reason: `cached answer was generated under answer policy ${stamped}, current policy is ${policyVersion}` }
  }

  const reply = String(entry.reply ?? '').trim()
  if (reply && answerNeedsFreshnessReflection(reply)) {
    return { ok: false, reason: 'cached answer fails the current answer-side freshness/integrity policy' }
  }

  if (maxAgeMs > 0) {
    const storedAt = entry.storedAt ? Date.parse(String(entry.storedAt)) : NaN
    if (!Number.isFinite(storedAt)) return { ok: false, reason: 'cached answer carries no usable stored-at timestamp' }
    const ageMs = now - storedAt
    if (ageMs > maxAgeMs) {
      return { ok: false, reason: `cached answer is ${Math.round(ageMs / 3_600_000)}h old, past the ${Math.round(maxAgeMs / 3_600_000)}h ceiling` }
    }
  }
  return { ok: true }
}
