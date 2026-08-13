import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type CognitiveProductionOutcomeInput = {
  skillKey: string
  success: boolean
  score?: number
  contradiction?: boolean
  contradictionReason?: string | null
  evidence?: Record<string, unknown>
}

/**
 * Record externally verified real-world evidence about a cognitive skill.
 *
 * Callers must only set contradiction=true when a deterministic verifier, trusted operator, or
 * equally explicit evidence demonstrates that the skill itself is contradicted. Model disagreement
 * alone is not enough. A verified contradiction quarantines the skill in the database; repeated
 * ordinary production failures weaken it and force revalidation.
 */
export async function recordVerifiedCognitiveProductionOutcome(
  input: CognitiveProductionOutcomeInput,
): Promise<Record<string, unknown> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const score = Number.isFinite(input.score) ? Math.max(0, Math.min(1, Number(input.score))) : (input.success ? 1 : 0)
  const result = await db.rpc('cos_record_cognitive_production_outcome', {
    p_skill_key: input.skillKey,
    p_success: input.success,
    p_score: score,
    p_contradiction: input.contradiction === true,
    p_contradiction_reason: input.contradictionReason || null,
    p_evidence: input.evidence || {},
  })
  if (result.error) throw result.error
  return result.data as Record<string, unknown> | null
}
