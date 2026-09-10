import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordCosUniversityAssessment } from './cosUniversityStore.ts'
import { COS_UNIVERSITY_SUBJECTS, type CosUniversitySubjectId } from './cosUniversity.ts'
import {
  COS_UNIVERSITY_ASSURANCE_PROFILE,
  evaluateRealWorldLearningEvidence,
  type RealWorldLearningEvidence,
} from './cosUniversityLearningAssurance.ts'
import { COS_UNIVERSITY_REAL_WORLD_OUTCOME_PROFILE } from './cosUniversityRealWorldOutcome.ts'

export const COS_UNIVERSITY_APPLIED_KNOWLEDGE_PROFILE = 'cos_university_applied_knowledge_v1'
const VALID_SUBJECTS = new Set(COS_UNIVERSITY_SUBJECTS.map(subject => subject.id))

type AssuranceRow = {
  id: string
  event_key: string
  subject_id: string | null
  candidate_id: string | null
  evidence_hash: string
  evidence: unknown
  verifier: string
  observed_at: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function evidenceMeasurement(value: unknown): RealWorldLearningEvidence | null {
  const measurement = record(record(value).measurement)
  const productionOutcome = record(measurement.productionOutcome)
  if (!Array.isArray(measurement.transferEvidenceRefs)
    || !Array.isArray(measurement.practicalEvidenceRefs)
    || !Array.isArray(measurement.delayedRetentionEvidenceRefs)
    || !Array.isArray(measurement.sourceEvidenceRefs)) return null
  const numeric = [measurement.baselineScore, measurement.postStudyScore, productionOutcome.baseline, productionOutcome.candidate, productionOutcome.sampleSize]
  if (!numeric.every(item => Number.isFinite(Number(item)))) return null
  return {
    baselineScore: Number(measurement.baselineScore),
    postStudyScore: Number(measurement.postStudyScore),
    transferEvidenceRefs: measurement.transferEvidenceRefs.map(String),
    practicalEvidenceRefs: measurement.practicalEvidenceRefs.map(String),
    delayedRetentionEvidenceRefs: measurement.delayedRetentionEvidenceRefs.map(String),
    sourceEvidenceRefs: measurement.sourceEvidenceRefs.map(String),
    productionOutcome: {
      baseline: Number(productionOutcome.baseline),
      candidate: Number(productionOutcome.candidate),
      higherIsBetter: productionOutcome.higherIsBetter === true,
      sampleSize: Number(productionOutcome.sampleSize),
    },
    independentScorer: measurement.independentScorer === true,
  }
}

/**
 * Converts independently verified, improved real-world outcomes into the existing Production
 * transfer stage. The append-only assurance event remains source authority; this bridge cannot
 * create credit from practice, retrieval, self-report, or an outcome that did not improve.
 */
export async function syncCosUniversityAppliedKnowledge(agentId: string, now = new Date()): Promise<{
  candidates: number
  qualified: number
  assessmentsWritten: number
}> {
  const id = String(agentId || '').trim()
  if (!id) throw new Error('agent_id_required')
  const db = cosServiceDb()
  if (!db) return { candidates: 0, qualified: 0, assessmentsWritten: 0 }
  const result = await db.from('cos_university_learning_assurance_events')
    .select('id,event_key,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at')
    .eq('event_type', 'learning_outcome')
    .eq('candidate_id', id)
    .eq('verifier', 'independent_scorer')
    .order('observed_at', { ascending: true })
    .limit(1000)
  if (result.error) throw result.error

  let qualified = 0
  let assessmentsWritten = 0
  for (const row of (result.data || []) as AssuranceRow[]) {
    const subjectId = String(row.subject_id || '') as CosUniversitySubjectId
    const envelope = record(row.evidence)
    const recordedDecision = record(envelope.decision)
    const measurement = evidenceMeasurement(envelope)
    if (!VALID_SUBJECTS.has(subjectId)
      || row.candidate_id !== id
      || envelope.profile !== COS_UNIVERSITY_REAL_WORLD_OUTCOME_PROFILE
      || envelope.agentId !== id
      || envelope.subjectId !== subjectId
      || !measurement) continue
    const decision = evaluateRealWorldLearningEvidence(measurement)
    if (!decision.promotionEligible
      || recordedDecision.promotionEligible !== true
      || recordedDecision.evidenceHash !== decision.evidenceHash
      || !/^[a-f0-9]{64}$/i.test(row.evidence_hash)) continue
    qualified += 1
    const observedAt = new Date(row.observed_at)
    if (!Number.isFinite(observedAt.getTime()) || observedAt > now) continue
    const written = await recordCosUniversityAssessment({
      agentId: id,
      assessmentKey: `cos-university-applied-knowledge:${row.event_key}`,
      subjectId,
      kind: 'production_transfer',
      passed: true,
      independentScorer: true,
      scorerVersion: COS_UNIVERSITY_APPLIED_KNOWLEDGE_PROFILE,
      scorerAuthority: 'verified_production',
      sourceRef: `db://cos_university_learning_assurance_events/${row.event_key}`,
      evidence: {
        assuranceEventId: row.id,
        assuranceEventKey: row.event_key,
        evidenceHash: row.evidence_hash,
        outcomeImproved: true,
        appliedKnowledge: true,
      },
      observedAt: observedAt.toISOString(),
      validUntil: new Date(observedAt.getTime() + 120 * 86_400_000).toISOString(),
    })
    if (written) assessmentsWritten += 1
  }
  return { candidates: result.data?.length || 0, qualified, assessmentsWritten }
}
