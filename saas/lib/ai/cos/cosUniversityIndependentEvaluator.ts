import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  FINE_TUNE_EVIDENCE_PROFILE,
  fineTuneRevisionKey,
  readFineTuneEvidence,
  type FineTuneRevision,
} from './cosUniversityFineTuneEvidence.ts'
import { readCosUniversityArtifactTrainingMode } from './cosUniversityDistillationPromotionEvidence.ts'

export const COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE = 'cos_university_independent_evaluator_v1' as const
export const INDEPENDENT_EVALUATOR_SIGNATURE_WINDOW_MS = 5 * 60_000
export const INDEPENDENT_EVALUATOR_CLAIMS = Object.freeze([
  'independent_evaluation',
  'safety_regression_passed',
  'unseen_transfer_passed',
  'delayed_retention_passed',
] as const)
export type IndependentEvaluatorClaim = typeof INDEPENDENT_EVALUATOR_CLAIMS[number]

export type IndependentEvaluatorPayload = Readonly<{
  candidateId: string
  claim: IndependentEvaluatorClaim
  revision: FineTuneRevision
  trainedArtifactId: string
  artifactHash: string
  evaluatorId: string
  evaluationSuiteHash: string
  evidenceRef: string
  verifiedSourceAttribution: true
  authorityExpanded: false
  baselineScore?: number
  trainedArtifactScore?: number
  holdoutManifestHash?: string
}>

type IndependentEvaluatorConfig = Readonly<{ secret: string }>

const HASH = /^[a-f0-9]{64}$/i
const HEX40 = /^[a-f0-9]{40}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EVALUATOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,239}$/
const MASS_CANDIDATE = /^mass:([0-9a-f-]{36}):([a-f0-9]{16})$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function isMassCandidate(candidateId: string): boolean {
  const match = MASS_CANDIDATE.exec(candidateId)
  return Boolean(match && UUID.test(match[1]))
}

async function serviceDb() {
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  return cosServiceDb()
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function finiteScore(value: unknown): number | null {
  const score = Number(value)
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null
}

function validRevision(revision: FineTuneRevision): boolean {
  const baseRevision = clean(revision?.baseModelRevision, 40).toLowerCase()
  return Boolean(clean(revision?.baseModel, 500))
    && (!baseRevision || HEX40.test(baseRevision))
    && HASH.test(clean(revision?.datasetHash, 64))
    && HASH.test(clean(revision?.trainingManifestHash, 64))
    && HASH.test(clean(revision?.holdoutManifestHash, 64))
    && clean(revision.trainingManifestHash, 64) !== clean(revision.holdoutManifestHash, 64)
}

export function independentEvaluatorConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): IndependentEvaluatorConfig | null {
  const secret = clean(env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET, 4096)
  if (secret.length < 32) return null
  return Object.freeze({ secret })
}

/** Prefer a deployed evaluator credential, falling back only to the service-only Vault secret. */
export async function independentEvaluatorConfig(): Promise<IndependentEvaluatorConfig | null> {
  const env = independentEvaluatorConfigFromEnv()
  if (env) return env
  const db = await serviceDb()
  if (!db) return null
  const { data, error } = await db.rpc('cos_read_independent_evaluator_secret')
  if (error) return null
  const secret = clean(data, 4096)
  return secret.length >= 32 ? Object.freeze({ secret }) : null
}

function signatureMessage(timestamp: string, idempotencyKey: string, rawBody: string): string {
  return [timestamp, idempotencyKey, rawBody].join('\n')
}

export function signIndependentEvaluatorPayload(input: {
  secret: string
  timestamp: string
  idempotencyKey: string
  rawBody: string
}): string {
  return createHmac('sha256', input.secret)
    .update(signatureMessage(input.timestamp, input.idempotencyKey, input.rawBody))
    .digest('hex')
}

export function verifyIndependentEvaluatorPayload(input: {
  secret: string
  timestamp: string
  idempotencyKey: string
  rawBody: string
  signature: string
  now?: Date
}): boolean {
  const observed = Date.parse(input.timestamp)
  const now = (input.now || new Date()).getTime()
  if (!Number.isFinite(observed) || observed > now + 60_000 || now - observed > INDEPENDENT_EVALUATOR_SIGNATURE_WINDOW_MS) return false
  const supplied = clean(input.signature, 128).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false
  const expected = signIndependentEvaluatorPayload(input)
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))
}

export function normalizeIndependentEvaluatorPayload(value: unknown): IndependentEvaluatorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('independent_evaluator_payload_invalid')
  const input = value as Record<string, unknown>
  const candidateId = clean(input.candidateId, 240)
  const study = /^study-plan:([0-9a-f-]+)$/i.exec(candidateId)
  const studyValid = Boolean(study && UUID.test(study[1]))
  const massValid = isMassCandidate(candidateId)
  if (!studyValid && !massValid) throw new Error('independent_evaluator_candidate_invalid')

  const claim = clean(input.claim, 80) as IndependentEvaluatorClaim
  if (!(INDEPENDENT_EVALUATOR_CLAIMS as readonly string[]).includes(claim)) throw new Error('independent_evaluator_claim_invalid')

  const rawRevision = input.revision as Record<string, unknown> | null
  const baseModelRevision = clean(rawRevision?.baseModelRevision, 40).toLowerCase()
  const revision: FineTuneRevision = {
    baseModel: clean(rawRevision?.baseModel, 500),
    ...(baseModelRevision ? { baseModelRevision } : {}),
    datasetHash: clean(rawRevision?.datasetHash, 64).toLowerCase(),
    trainingManifestHash: clean(rawRevision?.trainingManifestHash, 64).toLowerCase(),
    holdoutManifestHash: clean(rawRevision?.holdoutManifestHash, 64).toLowerCase(),
  }
  if (!validRevision(revision) || (massValid && !HEX40.test(baseModelRevision))) throw new Error('independent_evaluator_revision_invalid')

  const trainedArtifactId = clean(input.trainedArtifactId, 500)
  const artifactHash = clean(input.artifactHash, 64).toLowerCase()
  const evaluatorId = clean(input.evaluatorId, 240)
  const evaluationSuiteHash = clean(input.evaluationSuiteHash, 64).toLowerCase()
  const evidenceRef = clean(input.evidenceRef, 2000)
  if (!trainedArtifactId || !HASH.test(artifactHash)) throw new Error('independent_evaluator_artifact_invalid')
  if (!EVALUATOR_ID.test(evaluatorId)) throw new Error('independent_evaluator_identity_invalid')
  if (!HASH.test(evaluationSuiteHash)) throw new Error('independent_evaluator_suite_hash_invalid')
  if (!/^(?:https:\/\/|hf:\/\/|db:\/\/)/i.test(evidenceRef)) throw new Error('independent_evaluator_evidence_ref_invalid')
  if (input.verifiedSourceAttribution !== true) throw new Error('independent_evaluator_source_attribution_required')
  if (input.authorityExpanded !== false) throw new Error('independent_evaluator_authority_expansion_forbidden')

  let baselineScore: number | undefined
  let trainedArtifactScore: number | undefined
  let holdoutManifestHash: string | undefined
  if (claim === 'independent_evaluation') {
    const baseline = finiteScore(input.baselineScore)
    const trained = finiteScore(input.trainedArtifactScore)
    const holdout = clean(input.holdoutManifestHash, 64).toLowerCase()
    if (baseline === null || trained === null || !HASH.test(holdout) || holdout !== revision.holdoutManifestHash) {
      throw new Error('independent_evaluator_score_or_holdout_invalid')
    }
    baselineScore = baseline
    trainedArtifactScore = trained
    holdoutManifestHash = holdout
  }

  return Object.freeze({
    candidateId,
    claim,
    revision,
    trainedArtifactId,
    artifactHash,
    evaluatorId,
    evaluationSuiteHash,
    evidenceRef,
    verifiedSourceAttribution: true,
    authorityExpanded: false,
    ...(baselineScore === undefined ? {} : { baselineScore }),
    ...(trainedArtifactScore === undefined ? {} : { trainedArtifactScore }),
    ...(holdoutManifestHash === undefined ? {} : { holdoutManifestHash }),
  })
}

async function validateMassTrainingRegistration(input: {
  payload: IndependentEvaluatorPayload
  revisionKey: string
  observedAt: Date
}): Promise<{ teacherModelId: string }> {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const row = await db.from('cos_university_mass_distillation_batch_runs')
    .select('candidate_id,student_model_id,student_model_revision,teacher_model_id,dataset_hash,training_manifest_hash,holdout_manifest_hash,revision_key,trained_artifact_id,trained_artifact_hash,stage,completed_at')
    .eq('candidate_id', input.payload.candidateId)
    .maybeSingle()
  if (row.error) throw row.error
  const run: any = row.data
  if (!run || run.stage !== 'complete') throw new Error('independent_evaluator_mass_training_not_complete')
  const completedAt = Date.parse(String(run.completed_at || ''))
  if (!Number.isFinite(completedAt) || completedAt > input.observedAt.getTime()) throw new Error('independent_evaluator_mass_training_time_invalid')
  if (clean(run.student_model_id, 500) !== input.payload.revision.baseModel
    || clean(run.student_model_revision, 40).toLowerCase() !== clean(input.payload.revision.baseModelRevision, 40).toLowerCase()
    || clean(run.dataset_hash, 64).toLowerCase() !== input.payload.revision.datasetHash
    || clean(run.training_manifest_hash, 64).toLowerCase() !== input.payload.revision.trainingManifestHash
    || clean(run.holdout_manifest_hash, 64).toLowerCase() !== input.payload.revision.holdoutManifestHash
    || clean(run.revision_key, 64).toLowerCase() !== input.revisionKey
    || clean(run.trained_artifact_id, 500) !== input.payload.trainedArtifactId
    || clean(run.trained_artifact_hash, 64).toLowerCase() !== input.payload.artifactHash) {
    throw new Error('independent_evaluator_mass_artifact_registration_mismatch')
  }
  const teacherModelId = clean(run.teacher_model_id, 240)
  if (!teacherModelId) throw new Error('independent_evaluator_teacher_identity_missing')
  return { teacherModelId }
}

/** Records only evidence produced by the separately authenticated independent evaluator. */
export async function recordIndependentEvaluatorEvidence(input: {
  payload: unknown
  observedAt?: Date
  idempotencyKey: string
}) {
  const payload = normalizeIndependentEvaluatorPayload(input.payload)
  const observedAt = input.observedAt || new Date()
  if (!Number.isFinite(observedAt.getTime())) throw new Error('independent_evaluator_observed_at_invalid')
  const idempotencyKey = clean(input.idempotencyKey, 500)
  if (!idempotencyKey) throw new Error('independent_evaluator_idempotency_key_missing')
  const revisionKey = fineTuneRevisionKey(payload.revision)

  if (isMassCandidate(payload.candidateId)) {
    const mass = await validateMassTrainingRegistration({ payload, revisionKey, observedAt })
    if (mass.teacherModelId === payload.evaluatorId) throw new Error('independent_evaluator_teacher_separation_required')
  } else {
    const recorded = await readFineTuneEvidence(payload.candidateId, payload.revision, observedAt)
    if (recorded.trainedArtifactId !== payload.trainedArtifactId
      || clean(recorded.trainedArtifactHash, 64).toLowerCase() !== payload.artifactHash) {
      throw new Error('independent_evaluator_artifact_not_registered')
    }

    const mode = await readCosUniversityArtifactTrainingMode({
      candidateId: payload.candidateId,
      revision: payload.revision,
      trainedArtifactId: payload.trainedArtifactId,
      trainedArtifactHash: payload.artifactHash,
      now: observedAt,
    })
    if (mode.mode === 'distillation') {
      const teacher = clean(mode.distillation?.candidate?.teacherModelId, 240)
      if (!teacher) throw new Error('independent_evaluator_teacher_identity_missing')
      if (teacher === payload.evaluatorId) throw new Error('independent_evaluator_teacher_separation_required')
    }
  }

  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: FINE_TUNE_EVIDENCE_PROFILE,
    claim: payload.claim,
    evidenceRef: payload.evidenceRef,
    candidateId: payload.candidateId,
    revisionKey,
    trainedArtifactId: payload.trainedArtifactId,
    artifactHash: payload.artifactHash,
    evaluatorId: payload.evaluatorId,
    evaluationSuiteHash: payload.evaluationSuiteHash,
    verifiedSourceAttribution: true,
    authorityExpanded: false,
    ...(payload.claim === 'independent_evaluation' ? {
      baselineScore: payload.baselineScore,
      trainedArtifactScore: payload.trainedArtifactScore,
      holdoutManifestHash: payload.holdoutManifestHash,
    } : {}),
  }
  const evidenceHash = sha256(evidence)
  const eventKey = sha256([
    COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE,
    idempotencyKey,
    payload.candidateId,
    payload.claim,
    revisionKey,
    payload.trainedArtifactId,
    payload.evaluationSuiteHash,
  ])
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: null,
    candidate_id: payload.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'independent_scorer',
    observed_at: observedAt.toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error
  return Object.freeze({ ok: true as const, eventKey, claim: payload.claim, revisionKey })
}
