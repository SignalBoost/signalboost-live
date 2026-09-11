import { createHash } from 'node:crypto'
import type { FineTuneEvidence } from './cosUniversityLearningAssurance.ts'

export const FINE_TUNE_EVIDENCE_PROFILE = 'cos_university_fine_tune_evidence_v1'
export const FINE_TUNE_CLAIMS = Object.freeze([
  'dataset_approved', 'training_approved', 'trained_artifact_registered',
  'independent_evaluation', 'safety_regression_passed', 'unseen_transfer_passed',
  'delayed_retention_passed', 'production_canary_healthy', 'rollback_artifact_registered',
] as const)
export type FineTuneClaim = typeof FINE_TUNE_CLAIMS[number]
export type FineTuneHostClaim = Extract<FineTuneClaim, 'dataset_approved' | 'training_approved'>

export const FINE_TUNE_CLAIM_VERIFIER: Readonly<Record<FineTuneClaim, string>> = Object.freeze({
  dataset_approved: 'host_controller', training_approved: 'host_controller',
  trained_artifact_registered: 'training_executor', independent_evaluation: 'independent_scorer',
  safety_regression_passed: 'independent_scorer', unseen_transfer_passed: 'independent_scorer',
  delayed_retention_passed: 'independent_scorer', production_canary_healthy: 'host_production_verifier',
  rollback_artifact_registered: 'training_executor',
})

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)

async function serviceDb() {
  const mod = await import('@/lib/cos-core/storage/supabase')
  return mod.cosServiceDb()
}

/** The owner may approve inputs/execution only. Results require separate authoritative producers. */
export async function recordFineTuneHostApproval(input: {
  candidateId: string; subjectId?: string | null; claim: FineTuneHostClaim; evidenceRef: string
}) {
  const candidateId = String(input.candidateId || '').trim()
  const evidenceRef = String(input.evidenceRef || '').trim()
  if (!candidateId) return { ok: false as const, problems: ['candidate_id_missing'] }
  if (!['dataset_approved', 'training_approved'].includes(input.claim)) return { ok: false as const, problems: ['host_claim_not_permitted'] }
  if (!evidenceRef) return { ok: false as const, problems: ['evidence_ref_missing'] }
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = { profile: FINE_TUNE_EVIDENCE_PROFILE, claim: input.claim, candidateId, evidenceRef }
  const evidenceHash = hash(evidence)
  const eventKey = hash([FINE_TUNE_EVIDENCE_PROFILE, candidateId, input.claim, evidenceHash])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey, event_type: 'fine_tune', subject_id: input.subjectId || null,
    candidate_id: candidateId, evidence_hash: evidenceHash, evidence,
    verifier: 'host_controller', observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return { ok: true as const, eventKey, claim: input.claim }
}

export type RecordedFineTuneEvidence = Readonly<{
  claims: readonly FineTuneClaim[]; trainedArtifactId: string; rollbackArtifactRef: string | null;
  baselineScore: number; trainedArtifactScore: number
}>

const EMPTY: RecordedFineTuneEvidence = Object.freeze({ claims: Object.freeze([]), trainedArtifactId: '', rollbackArtifactRef: null, baselineScore: 0, trainedArtifactScore: 0 })

export function foldFineTuneEvidenceRows(rows: readonly any[]): RecordedFineTuneEvidence {
  const claims = new Set<FineTuneClaim>(); let trainedArtifactId = ''; let rollbackArtifactRef: string | null = null
  let baselineScore = 0; let trainedArtifactScore = 0
  for (const row of [...rows].sort((a, b) => String(a?.observed_at || '').localeCompare(String(b?.observed_at || '')))) {
    const evidence = row?.evidence; const claim = evidence?.claim as FineTuneClaim
    if (evidence?.profile !== FINE_TUNE_EVIDENCE_PROFILE || !FINE_TUNE_CLAIMS.includes(claim)) continue
    if (row?.verifier !== FINE_TUNE_CLAIM_VERIFIER[claim] || !String(evidence.evidenceRef || '').trim()) continue
    if (claim === 'trained_artifact_registered' && (!String(evidence.trainedArtifactId || '').trim() || !validHash(evidence.artifactHash))) continue
    if (claim === 'rollback_artifact_registered' && !String(evidence.rollbackArtifactRef || '').trim()) continue
    if (claim === 'independent_evaluation' && (!Number.isFinite(evidence.baselineScore) || !Number.isFinite(evidence.trainedArtifactScore) || !validHash(evidence.holdoutManifestHash))) continue
    claims.add(claim)
    if (claim === 'trained_artifact_registered') trainedArtifactId = evidence.trainedArtifactId
    if (claim === 'rollback_artifact_registered') rollbackArtifactRef = evidence.rollbackArtifactRef
    if (claim === 'independent_evaluation') { baselineScore = evidence.baselineScore; trainedArtifactScore = evidence.trainedArtifactScore }
  }
  return Object.freeze({ claims: Object.freeze([...claims]), trainedArtifactId, rollbackArtifactRef, baselineScore, trainedArtifactScore })
}

export async function readFineTuneEvidence(candidateId: string): Promise<RecordedFineTuneEvidence> {
  if (!String(candidateId || '').trim()) return EMPTY
  const db = await serviceDb(); if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_learning_assurance_events').select('evidence,verifier,observed_at')
    .eq('event_type', 'fine_tune').eq('candidate_id', candidateId).order('observed_at', { ascending: true }).limit(200)
  if (rows.error) throw rows.error
  return foldFineTuneEvidenceRows(rows.data || [])
}

export function buildFineTuneEvidenceInput(base: { baseModel: string; datasetHash: string; trainingManifestHash: string; holdoutManifestHash: string }, recorded: RecordedFineTuneEvidence): FineTuneEvidence {
  const has = (claim: FineTuneClaim) => recorded.claims.includes(claim)
  return { trainedArtifactId: recorded.trainedArtifactId, baseModel: base.baseModel, datasetHash: base.datasetHash,
    trainingManifestHash: base.trainingManifestHash, holdoutManifestHash: base.holdoutManifestHash,
    datasetApprovedByHost: has('dataset_approved'), trainingApprovedByHost: has('training_approved'),
    independentEvaluation: has('independent_evaluation'), baselineScore: recorded.baselineScore,
    trainedArtifactScore: recorded.trainedArtifactScore, passedSafetyRegression: has('safety_regression_passed'),
    passedUnseenTransfer: has('unseen_transfer_passed'), passedDelayedRetention: has('delayed_retention_passed'),
    productionCanaryHealthy: has('production_canary_healthy'), rollbackArtifactRef: recorded.rollbackArtifactRef }
}
