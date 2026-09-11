import { createHash } from 'node:crypto'
import type { FineTuneEvidence } from './cosUniversityLearningAssurance.ts'

export const FINE_TUNE_EVIDENCE_PROFILE = 'cos_university_fine_tune_evidence_v1'
export const FINE_TUNE_CLAIMS = Object.freeze([
  'partition_manifests_registered', 'dataset_approved', 'training_approved', 'trained_artifact_registered',
  'independent_evaluation', 'safety_regression_passed', 'unseen_transfer_passed',
  'delayed_retention_passed', 'production_canary_healthy', 'rollback_artifact_registered',
] as const)
export type FineTuneClaim = typeof FINE_TUNE_CLAIMS[number]
export type FineTuneHostClaim = Extract<FineTuneClaim, 'dataset_approved' | 'training_approved'>

export const FINE_TUNE_CLAIM_VERIFIER: Readonly<Record<FineTuneClaim, string>> = Object.freeze({
  partition_manifests_registered: 'training_executor',
  dataset_approved: 'host_controller', training_approved: 'host_controller',
  trained_artifact_registered: 'training_executor', independent_evaluation: 'independent_scorer',
  safety_regression_passed: 'independent_scorer', unseen_transfer_passed: 'independent_scorer',
  delayed_retention_passed: 'independent_scorer', production_canary_healthy: 'host_production_verifier',
  rollback_artifact_registered: 'training_executor',
})

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
export type FineTuneRevision = Readonly<{ baseModel: string; datasetHash: string; trainingManifestHash: string; holdoutManifestHash: string }>
export const fineTuneRevisionKey = (revision: FineTuneRevision) => hash(revision)
const manifestHash = (items: readonly string[]) => hash({ items: [...items].sort() })

async function serviceDb() {
  const mod = await import('@/lib/cos-core/storage/supabase')
  return mod.cosServiceDb()
}

/** The owner may approve inputs/execution only. Results require separate authoritative producers. */
export async function recordFineTuneHostApproval(input: {
  candidateId: string; subjectId?: string | null; claim: FineTuneHostClaim; evidenceRef: string; revision: FineTuneRevision
}) {
  const candidateId = String(input.candidateId || '').trim()
  const evidenceRef = String(input.evidenceRef || '').trim()
  if (!candidateId) return { ok: false as const, problems: ['candidate_id_missing'] }
  if (!['dataset_approved', 'training_approved'].includes(input.claim)) return { ok: false as const, problems: ['host_claim_not_permitted'] }
  if (!evidenceRef) return { ok: false as const, problems: ['evidence_ref_missing'] }
  if (!input.revision.baseModel.trim() || !validHash(input.revision.datasetHash) || !validHash(input.revision.trainingManifestHash) || !validHash(input.revision.holdoutManifestHash)) return { ok: false as const, problems: ['candidate_revision_invalid'] }
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = { profile: FINE_TUNE_EVIDENCE_PROFILE, claim: input.claim, candidateId, evidenceRef, revisionKey: fineTuneRevisionKey(input.revision) }
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
  claims: readonly FineTuneClaim[]; trainedArtifactId: string; trainedArtifactHash: string; rollbackArtifactRef: string | null;
  baselineScore: number; trainedArtifactScore: number
}>

const EMPTY: RecordedFineTuneEvidence = Object.freeze({ claims: Object.freeze([]), trainedArtifactId: '', trainedArtifactHash: '', rollbackArtifactRef: null, baselineScore: 0, trainedArtifactScore: 0 })

export function foldFineTuneEvidenceRows(rows: readonly any[], expectedRevisionKey?: string, expectedHoldoutManifestHash?: string, now = new Date()): RecordedFineTuneEvidence {
  const ordered = [...rows].sort((a, b) => String(a?.observed_at || '').localeCompare(String(b?.observed_at || '')))
  const valid = ordered.filter(row => {
    const evidence = row?.evidence; const claim = evidence?.claim as FineTuneClaim
    return evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE && FINE_TUNE_CLAIMS.includes(claim)
      && (!expectedRevisionKey || evidence.revisionKey === expectedRevisionKey)
      && (!row?.expires_at || Date.parse(row.expires_at) > now.getTime())
      && row?.verifier === FINE_TUNE_CLAIM_VERIFIER[claim] && Boolean(String(evidence.evidenceRef || '').trim())
  })
  const artifactRow = [...valid].reverse().find(row => row.evidence.claim === 'trained_artifact_registered'
    && String(row.evidence.trainedArtifactId || '').trim() && validHash(row.evidence.artifactHash))
  const trainedArtifactId = String(artifactRow?.evidence?.trainedArtifactId || '')
  const trainedArtifactHash = String(artifactRow?.evidence?.artifactHash || '')
  const artifactObservedAt = String(artifactRow?.observed_at || '')
  const postTrainingClaims = new Set<FineTuneClaim>([
    'independent_evaluation', 'safety_regression_passed', 'unseen_transfer_passed',
    'delayed_retention_passed', 'production_canary_healthy', 'rollback_artifact_registered',
  ])
  const claims = new Set<FineTuneClaim>(); let rollbackArtifactRef: string | null = null
  let baselineScore = 0; let trainedArtifactScore = 0
  for (const row of valid) {
    const evidence = row?.evidence; const claim = evidence?.claim as FineTuneClaim
    if (claim === 'trained_artifact_registered' && (!String(evidence.trainedArtifactId || '').trim() || !validHash(evidence.artifactHash))) continue
    if (postTrainingClaims.has(claim) && (!trainedArtifactId || evidence.trainedArtifactId !== trainedArtifactId
      || evidence.artifactHash !== trainedArtifactHash || String(row?.observed_at || '') < artifactObservedAt)) continue
    if (claim === 'rollback_artifact_registered' && !String(evidence.rollbackArtifactRef || '').trim()) continue
    if (claim === 'independent_evaluation' && (!Number.isFinite(evidence.baselineScore) || !Number.isFinite(evidence.trainedArtifactScore)
      || !validHash(evidence.holdoutManifestHash) || (expectedHoldoutManifestHash && evidence.holdoutManifestHash !== expectedHoldoutManifestHash))) continue
    claims.add(claim)
    if (claim === 'rollback_artifact_registered') rollbackArtifactRef = evidence.rollbackArtifactRef
    if (claim === 'independent_evaluation') { baselineScore = evidence.baselineScore; trainedArtifactScore = evidence.trainedArtifactScore }
  }
  return Object.freeze({ claims: Object.freeze([...claims]), trainedArtifactId, trainedArtifactHash, rollbackArtifactRef, baselineScore, trainedArtifactScore })
}

export async function readFineTuneEvidence(candidateId: string, revision: FineTuneRevision): Promise<RecordedFineTuneEvidence> {
  if (!String(candidateId || '').trim()) return EMPTY
  const db = await serviceDb(); if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_learning_assurance_events').select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune').eq('candidate_id', candidateId).order('observed_at', { ascending: false }).limit(200)
  if (rows.error) throw rows.error
  return foldFineTuneEvidenceRows(rows.data || [], fineTuneRevisionKey(revision), revision.holdoutManifestHash)
}

export async function readFineTunePartitionRevision(candidateId: string, datasetHash: string): Promise<FineTuneRevision | null> {
  const db = await serviceDb(); if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events').select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune').eq('candidate_id', candidateId).order('observed_at', { ascending: false }).limit(200)
  if (result.error) throw result.error
  for (const row of result.data || []) {
    const evidence = row?.evidence
    if (evidence?.profile !== FINE_TUNE_EVIDENCE_PROFILE || evidence.claim !== 'partition_manifests_registered'
      || row.verifier !== 'training_executor' || evidence.datasetHash !== datasetHash || !String(evidence.evidenceRef || '').trim()
      || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) continue
    const training = Array.isArray(evidence.trainingItemHashes) ? evidence.trainingItemHashes : []
    const holdout = Array.isArray(evidence.holdoutItemHashes) ? evidence.holdoutItemHashes : []
    if (!training.length || !holdout.length || !training.every(validHash) || !holdout.every(validHash)) continue
    if (training.some((item: string) => new Set(holdout).has(item))) continue
    const baseModel = String(evidence.baseModel || '').trim(); if (!baseModel) continue
    return { baseModel, datasetHash, trainingManifestHash: manifestHash(training), holdoutManifestHash: manifestHash(holdout) }
  }
  return null
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
