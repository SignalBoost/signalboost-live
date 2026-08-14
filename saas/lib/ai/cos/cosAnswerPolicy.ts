//
// WHY THIS FILE EXISTS.
//
// Cache entries must be partitioned by the exact answer-generation policy that produced them.
// Retrieval/gating changes therefore get a manual revision bump so old answers become inert rather
// than silently surviving a semantic-retrieval rewrite.

import { createHash } from 'node:crypto'

/**
 * Bump this by hand when the GATE, retrieval policy, or evidence representation changes in a
 * way the inputs below cannot see — the specificity scorer's rules, evidence ceiling, citation
 * accounting, domain-gating rules, or serialized evidence context used by semantic cache
 * embeddings. Changing the reasoner prompt or the model does NOT need a manual bump; those are
 * hashed directly.
 */
export const COS_ANSWER_GATE_REVISION = '2026-08-14.semantic-evidence-reconciliation.v5'

export type CosAnswerPolicyInputs = {
  reasonerSystemPrompt: string
  model: string | null
  threshold: number
  gateRevision?: string
}

export function cosAnswerPolicyVersion(inputs: CosAnswerPolicyInputs): string {
  const payload = JSON.stringify({
    prompt: String(inputs.reasonerSystemPrompt || ''),
    model: String(inputs.model || '').trim().toLowerCase(),
    threshold: Number(inputs.threshold).toFixed(2),
    gate: inputs.gateRevision ?? COS_ANSWER_GATE_REVISION,
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
