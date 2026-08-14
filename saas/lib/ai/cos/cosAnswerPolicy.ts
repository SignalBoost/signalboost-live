//
// WHY THIS FILE EXISTS.
//
// The semantic cache finally works. That is the good news, and it immediately produced a
// worse failure than the one it fixed: once a confident answer is stored, EVERY later ask of
// the same question is served from the store and the reasoner never runs again. Nothing in
// the cache key described HOW the cached answer was produced — not the model, not the
// reasoner's instructions, not the confidence gate. So a cached answer written by
// qwen2.5-coder:32b under an old prompt survives a model swap, a prompt rewrite, a threshold
// change and a specificity-cap fix, and keeps being served as the current answer, at its
// original confidence, forever (cos_knowledge_records has no expiry and cos_match_knowledge
// filters on task_id alone).
//
// The practical damage: every quality lever left on the table — swapping to
// qwen2.5:32b-instruct, tightening the reasoner prompt — becomes UNMEASURABLE, because the
// benchmark question is answered from cache and the change never gets a chance to show.
//
// THE FIX, and the reason it needs no migration. cos_match_knowledge already filters by
// task_id, and the exact-cache key already accepts a policy version. So stamping the
// generation policy into the task id partitions the cache by it: entries written under a
// different model/prompt/gate are simply not visible to the lookup, without a schema change,
// an RPC change, or a purge. Old rows become inert rather than wrong. Bump-by-construction:
// change the prompt or the model and the version changes with it, with nothing to remember.
//
// Dependency-free ON PURPOSE — cosFirstAnswer.ts imports @supabase/supabase-js transitively
// and cannot be unit-tested, which is exactly how the earlier parse and citation bugs went
// uncovered for so long. Everything here is testable without a database.

import { createHash } from 'node:crypto'

/**
 * Bump this by hand when the GATE or evidence representation changes in a way the inputs
 * below cannot see — the specificity scorer's rules, evidence ceiling, citation accounting,
 * or the serialized evidence context used by semantic cache embeddings. Changing the
 * reasoner prompt or the model does NOT need a manual bump; those are hashed directly.
 */
export const COS_ANSWER_GATE_REVISION = '2026-08-13.structured-evidence.v3'

export type CosAnswerPolicyInputs = {
  /** The exact reasoner system prompt in force. Hash the same language every time (see cosFirstAnswer) so five locales do not fragment one cache into five. */
  reasonerSystemPrompt: string
  /** LOCAL_AI_MODEL, or whatever label identifies the reasoner actually generating answers. */
  model: string | null
  /** The confidence gate a cached answer had to clear to be stored. */
  threshold: number
  /** Defaults to COS_ANSWER_GATE_REVISION; injectable so tests do not depend on the constant. */
  gateRevision?: string
}

/**
 * A short, stable fingerprint of everything that decides what an answer looks like.
 * Deterministic across deploys and instances: same inputs, same string.
 */
export function cosAnswerPolicyVersion(inputs: CosAnswerPolicyInputs): string {
  const payload = JSON.stringify({
    prompt: String(inputs.reasonerSystemPrompt || ''),
    model: String(inputs.model || '').trim().toLowerCase(),
    threshold: Number(inputs.threshold).toFixed(2),
    gate: inputs.gateRevision ?? COS_ANSWER_GATE_REVISION,
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

/**
 * The task id the cache is read and written under. cos_match_knowledge filters on this
 * column, so a version change makes older entries unreachable without deleting anything.
 */
export function cosCacheTaskId(baseTaskId: string, policyVersion: string): string {
  return `${baseTaskId}@${policyVersion}`
}

/**
 * Age ceiling for a cached answer, on top of the version partition. The version handles
 * "we changed how answers are made"; this handles "the world moved on" — a diagnosis cached
 * six months ago should be re-derived even if nothing about COS changed. Default 7 days.
 * Set COS_ANSWER_CACHE_MAX_AGE_MS=0 to disable ageing entirely.
 */
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

/**
 * Whether a cached answer may still be served. Returns a REASON on refusal rather than a
 * bare boolean, because a cache that silently declines to hit is indistinguishable from a
 * cache that is broken — this codebase has already lost days to exactly that ambiguity.
 *
 * An entry with no stamp at all is a pre-versioning row: refused, and named as such. It was
 * written before anything recorded how it was produced, which is the whole defect.
 */
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
