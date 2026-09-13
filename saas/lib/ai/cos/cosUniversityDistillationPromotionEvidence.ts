import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  FINE_TUNE_EVIDENCE_PROFILE,
  fineTuneRevisionKey,
  type FineTuneRevision,
} from './cosUniversityFineTuneEvidence.ts'
import type { ModelDistillationCandidateInput } from './cosUniversityModelDistillation.ts'

export type CosUniversityDistillationPromotionContext = Readonly<{
  mode: 'distillation'
  candidate: ModelDistillationCandidateInput | null
  independentEvaluatorId: string
  teacherModelIdUsedAsEvaluator: boolean
  verifiedSourceAttribution: boolean
  authorityExpanded: boolean
}>

export type CosUniversityArtifactTrainingMode = Readonly<{
  mode: 'fine_tune' | 'distillation' | 'unknown' | null
  distillation: CosUniversityDistillationPromotionContext | null
}>

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function validAt(row: any, now: Date): boolean {
  const observedAt = Date.parse(String(row?.observed_at || ''))
  return Number.isFinite(observedAt)
    && observedAt <= now.getTime()
    && (!row?.expires_at || Date.parse(String(row.expires_at)) > now.getTime())
}

function sameArtifact(evidence: any, input: { artifactId: string; artifactHash: string; revisionKey: string }): boolean {
  return clean(evidence?.trainedArtifactId, 500) === input.artifactId
    && clean(evidence?.artifactHash, 64).toLowerCase() === input.artifactHash.toLowerCase()
    && clean(evidence?.revisionKey, 64) === input.revisionKey
}

function asDistillationCandidate(value: unknown): ModelDistillationCandidateInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  return {
    teacherModelId: clean(row.teacherModelId, 240),
    studentModelId: clean(row.studentModelId, 240),
    datasetHash: clean(row.datasetHash, 64).toLowerCase(),
    provenanceRefs: Array.isArray(row.provenanceRefs)
      ? [...new Set(row.provenanceRefs.map(item => clean(item, 1000)).filter(Boolean))]
      : [],
    trainingRights: clean(row.trainingRights, 80) as ModelDistillationCandidateInput['trainingRights'],
    studentControlledByBuyer: row.studentControlledByBuyer === true,
    containsPrivateProductionData: row.containsPrivateProductionData as boolean,
    repeatedFailures: Number(row.repeatedFailures),
    independentRetestFailures: Number(row.independentRetestFailures),
  }
}

/**
 * Reads the training mode bound to the exact trained artifact. Fine-tuned artifacts use the normal
 * controlled-fine-tune promotion gate. Distilled artifacts require the additional teacher/evaluator,
 * source-attribution and no-authority-expansion evidence before promotion can be reported.
 */
export async function readCosUniversityArtifactTrainingMode(input: {
  candidateId: string
  revision: FineTuneRevision
  trainedArtifactId: string
  trainedArtifactHash: string
  now?: Date
}): Promise<CosUniversityArtifactTrainingMode> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const now = input.now || new Date()
  const revisionKey = fineTuneRevisionKey(input.revision)
  const artifactId = clean(input.trainedArtifactId, 500)
  const artifactHash = clean(input.trainedArtifactHash, 64).toLowerCase()
  if (!artifactId || !artifactHash) return { mode: null, distillation: null }

  const rows = await db.from('cos_university_learning_assurance_events')
    .select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', input.candidateId)
    .order('observed_at', { ascending: false })
    .limit(300)
  if (rows.error) throw rows.error
  const valid = (rows.data || []).filter(row => validAt(row, now))
  const artifact = valid.find(row => {
    const evidence: any = row.evidence
    return row.verifier === 'training_executor'
      && evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'trained_artifact_registered'
      && sameArtifact(evidence, { artifactId, artifactHash, revisionKey })
  })
  if (!artifact) return { mode: null, distillation: null }
  const artifactEvidence: any = artifact.evidence
  if (artifactEvidence.trainingMode === 'fine_tune') return { mode: 'fine_tune', distillation: null }
  if (artifactEvidence.trainingMode !== 'distillation') return { mode: 'unknown', distillation: null }

  const candidate = asDistillationCandidate(artifactEvidence.distillationCandidate)
  const independent = valid.find(row => {
    const evidence: any = row.evidence
    return row.verifier === 'independent_scorer'
      && evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'independent_evaluation'
      && sameArtifact(evidence, { artifactId, artifactHash, revisionKey })
  })
  const canary = valid.find(row => {
    const evidence: any = row.evidence
    return row.verifier === 'host_production_verifier'
      && evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'production_canary_healthy'
      && sameArtifact(evidence, { artifactId, artifactHash, revisionKey })
  })
  const independentEvidence: any = independent?.evidence
  const canaryEvidence: any = canary?.evidence
  const evaluatorId = clean(independentEvidence?.evaluatorId, 240)
  return {
    mode: 'distillation',
    distillation: {
      mode: 'distillation',
      candidate,
      independentEvaluatorId: evaluatorId,
      teacherModelIdUsedAsEvaluator: Boolean(candidate && evaluatorId && evaluatorId === clean(candidate.teacherModelId, 240)),
      verifiedSourceAttribution: independentEvidence?.verifiedSourceAttribution === true,
      // Unknown is deliberately treated as expansion so the promotion policy fails closed.
      authorityExpanded: canaryEvidence?.authorityExpanded === false ? false : true,
    },
  }
}
