import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  COS_UNIVERSITY_ASSURANCE_PROFILE,
  evaluateRealWorldLearningEvidence,
  type RealWorldLearningEvidence,
} from './cosUniversityLearningAssurance.ts'
import type { CosUniversitySubjectId } from './cosUniversity.ts'

export const COS_UNIVERSITY_REAL_WORLD_OUTCOME_PROFILE = 'cos_university_real_world_outcome_v1'

export type CosUniversityRealWorldOutcomeResult = Readonly<{
  stored: boolean
  inserted: boolean
  promotionEligible: boolean
  evidenceRef: string | null
}>

function cleanIdentity(value: string, label: string): string {
  const cleaned = String(value ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(cleaned)) throw new Error(`${label}_invalid`)
  return cleaned
}

/**
 * Records an immutable, agent-scoped decision about demonstrated learning. The supplied references
 * must resolve to independent source systems; this recorder never manufactures exam or outcome proof.
 */
export async function recordCosUniversityRealWorldOutcome(input: {
  agentId: string
  subjectId: CosUniversitySubjectId
  evidence: RealWorldLearningEvidence
  observedAt?: Date
}): Promise<CosUniversityRealWorldOutcomeResult> {
  const agentId = cleanIdentity(input.agentId, 'agent_id')
  const subjectId = cleanIdentity(input.subjectId, 'subject_id') as CosUniversitySubjectId
  const observedAt = input.observedAt instanceof Date ? input.observedAt : new Date()
  if (!Number.isFinite(observedAt.getTime())) throw new Error('observed_at_invalid')

  const decision = evaluateRealWorldLearningEvidence(input.evidence)
  const evidence = {
    profile: COS_UNIVERSITY_REAL_WORLD_OUTCOME_PROFILE,
    semantics: 'independent_retention_transfer_and_production_improvement_decision',
    agentId,
    subjectId,
    measurement: input.evidence,
    decision,
  }
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  const eventKey = createHash('sha256').update([
    COS_UNIVERSITY_ASSURANCE_PROFILE,
    COS_UNIVERSITY_REAL_WORLD_OUTCOME_PROFILE,
    agentId,
    subjectId,
    evidenceHash,
  ].join('|')).digest('hex')
  const evidenceRef = `db://cos_university_learning_assurance_events/${eventKey}`
  const db = cosServiceDb()
  if (!db) return { stored: false, inserted: false, promotionEligible: decision.promotionEligible, evidenceRef: null }

  const inserted = await db.from('cos_university_learning_assurance_events').insert({
    event_key: eventKey,
    event_type: 'learning_outcome',
    subject_id: subjectId,
    // Existing assurance schema uses candidate_id as the durable evaluated-agent identity.
    candidate_id: agentId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: input.evidence.independentScorer ? 'independent_scorer' : 'host_controller',
    observed_at: observedAt.toISOString(),
  })
  if (inserted.error) {
    const code = String((inserted.error as { code?: unknown }).code ?? '')
    if (code === '23505') return { stored: true, inserted: false, promotionEligible: decision.promotionEligible, evidenceRef }
    throw inserted.error
  }
  return { stored: true, inserted: true, promotionEligible: decision.promotionEligible, evidenceRef }
}
