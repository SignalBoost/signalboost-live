import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { decideControlledFineTune } from './cosUniversityLearningAssurance.ts'
import {
  buildFineTuneEvidenceInput,
  buildFineTunePartitionRevision,
  FINE_TUNE_EVIDENCE_PROFILE,
  fineTuneRevisionKey,
  readFineTuneEvidence,
  readFineTunePartitionRevision,
  type FineTuneRevision,
} from './cosUniversityFineTuneEvidence.ts'
import {
  decideModelDistillationCandidate,
  type ModelDistillationCandidateInput,
} from './cosUniversityModelDistillation.ts'
import {
  controlledFineTuneDatasetDescriptor,
  controlledFineTuneDatasetHash,
} from './cosUniversityTrainingIdentity.ts'

export const COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE = 'cos_university_training_executor_v1' as const
export const TRAINING_EXECUTOR_SIGNATURE_WINDOW_MS = 5 * 60_000
export const TRAINING_EXECUTOR_CLAIMS = Object.freeze([
  'partition_manifests_registered',
  'trained_artifact_registered',
  'rollback_artifact_registered',
] as const)
export type TrainingExecutorClaim = typeof TRAINING_EXECUTOR_CLAIMS[number]
export type TrainingMode = 'fine_tune' | 'distillation'

type ExecutorConfig = Readonly<{
  url: string
  secret: string
  dispatchEnabled: boolean
}>

type CandidatePlanRow = Readonly<{
  id: string
  plan_key: string
  subject_id: string | null
  failure_class: string | null
  objective: string | null
  methods: unknown
  source_ref: string | null
  fine_tune_candidate: boolean
  status: string
}>

type PartitionMaterialization = Readonly<{
  revision: FineTuneRevision
  trainingDataRef: string
  holdoutDataRef: string
  evidenceRef: string
}>

const HASH = /^[a-f0-9]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizedHashes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const normalized = value.map(item => clean(item, 64).toLowerCase())
  if (normalized.some(item => !HASH.test(item))) return null
  const unique = [...new Set(normalized)]
  return unique.length ? unique : null
}

function validRevision(revision: FineTuneRevision): boolean {
  return Boolean(clean(revision.baseModel))
    && HASH.test(revision.datasetHash)
    && HASH.test(revision.trainingManifestHash)
    && HASH.test(revision.holdoutManifestHash)
    && revision.trainingManifestHash !== revision.holdoutManifestHash
}

async function serviceDb() {
  const mod = await import('../../cos-core/storage/supabase.ts')
  return mod.cosServiceDb()
}

export function trainingExecutorConfigFromEnv(env: Record<string, string | undefined> = process.env): ExecutorConfig | null {
  const rawUrl = clean(env.COS_UNIVERSITY_TRAINING_EXECUTOR_URL, 2000)
  const secret = clean(env.COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET, 4096)
  if (!rawUrl || secret.length < 32) return null
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return null
    return {
      url: url.toString(),
      secret,
      dispatchEnabled: env.COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED === 'true',
    }
  } catch {
    return null
  }
}

export function trainingExecutorReadiness(env: Record<string, string | undefined> = process.env) {
  const config = trainingExecutorConfigFromEnv(env)
  return Object.freeze({
    configured: Boolean(config),
    dispatchEnabled: config?.dispatchEnabled === true,
    endpoint: config ? new URL(config.url).origin : null,
    semantics: 'buyer_controlled_https_executor_no_hosted_fallback',
  })
}

export function requireExplicitTrainingDispatchConfirmation(value: unknown): true {
  if (value !== true) throw new Error('training_executor_explicit_confirmation_required')
  return true
}

function signatureMessage(timestamp: string, idempotencyKey: string, rawBody: string): string {
  return `${timestamp}\n${idempotencyKey}\n${rawBody}`
}

export function signTrainingExecutorPayload(input: {
  secret: string
  timestamp: string
  idempotencyKey: string
  rawBody: string
}): string {
  return createHmac('sha256', input.secret)
    .update(signatureMessage(input.timestamp, input.idempotencyKey, input.rawBody))
    .digest('hex')
}

export function verifyTrainingExecutorPayload(input: {
  secret: string
  timestamp: string
  idempotencyKey: string
  rawBody: string
  signature: string
  now?: Date
}): boolean {
  const observed = Date.parse(input.timestamp)
  const now = (input.now || new Date()).getTime()
  if (!Number.isFinite(observed) || observed > now + 60_000 || now - observed > TRAINING_EXECUTOR_SIGNATURE_WINDOW_MS) return false
  const supplied = clean(input.signature, 128).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false
  const expected = signTrainingExecutorPayload(input)
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))
}

function candidatePlanId(candidateId: string): string {
  const match = /^study-plan:([0-9a-f-]+)$/i.exec(clean(candidateId, 100))
  if (!match || !UUID.test(match[1])) throw new Error('training_executor_candidate_id_invalid')
  return match[1]
}

async function readCandidatePlan(candidateId: string, options: { requireActive?: boolean } = {}): Promise<CandidatePlanRow> {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const id = candidatePlanId(candidateId)
  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,subject_id,failure_class,objective,methods,source_ref,fine_tune_candidate,status')
    .eq('id', id).maybeSingle()
  if (result.error) throw result.error
  const plan = result.data as CandidatePlanRow | null
  if (!plan || plan.fine_tune_candidate !== true) throw new Error('training_executor_candidate_not_authorized')
  if (options.requireActive !== false && !['queued', 'studying', 'ready_for_exam'].includes(plan.status)) {
    throw new Error('training_executor_candidate_inactive')
  }
  return plan
}

async function recordExecutorEvent(input: {
  candidateId: string
  subjectId?: string | null
  claim: TrainingExecutorClaim
  evidence: Record<string, unknown>
  observedAt?: Date
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const observedAt = input.observedAt || new Date()
  const evidence = {
    profile: FINE_TUNE_EVIDENCE_PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
  }
  const evidenceHash = hash(evidence)
  const eventKey = hash([FINE_TUNE_EVIDENCE_PROFILE, input.candidateId, input.claim, evidenceHash])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId || null,
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'training_executor',
    observed_at: observedAt.toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return { ok: true as const, eventKey, claim: input.claim }
}

export function validateTrainingExecutorPartition(input: {
  baseModel: unknown
  datasetHash: unknown
  trainingItemHashes: unknown
  holdoutItemHashes: unknown
}) {
  const trainingItemHashes = normalizedHashes(input.trainingItemHashes)
  const holdoutItemHashes = normalizedHashes(input.holdoutItemHashes)
  if (!trainingItemHashes || !holdoutItemHashes) return null
  const revision = buildFineTunePartitionRevision({
    baseModel: input.baseModel,
    datasetHash: input.datasetHash,
    trainingItemHashes,
    holdoutItemHashes,
  })
  return revision ? { revision, trainingItemHashes, holdoutItemHashes } : null
}

async function readPartitionMaterialization(candidateId: string, revision: FineTuneRevision, now = new Date()): Promise<PartitionMaterialization | null> {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_learning_assurance_events')
    .select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .order('observed_at', { ascending: false })
    .limit(200)
  if (rows.error) throw rows.error
  const expectedKey = fineTuneRevisionKey(revision)
  for (const row of rows.data || []) {
    const evidence: any = row.evidence
    const observedAt = Date.parse(String(row.observed_at || ''))
    if (row.verifier !== 'training_executor'
      || evidence?.profile !== FINE_TUNE_EVIDENCE_PROFILE
      || evidence?.claim !== 'partition_manifests_registered'
      || evidence?.revisionKey !== expectedKey
      || !Number.isFinite(observedAt) || observedAt > now.getTime()
      || (row.expires_at && Date.parse(row.expires_at) <= now.getTime())) continue
    const materialized = validateTrainingExecutorPartition(evidence)
    if (!materialized || fineTuneRevisionKey(materialized.revision) !== expectedKey) continue
    const trainingDataRef = clean(evidence.trainingDataRef, 2000)
    const holdoutDataRef = clean(evidence.holdoutDataRef, 2000)
    const evidenceRef = clean(evidence.evidenceRef, 2000)
    if (trainingDataRef && holdoutDataRef && evidenceRef) return { revision: materialized.revision, trainingDataRef, holdoutDataRef, evidenceRef }
  }
  return null
}

async function recordDispatchAudit(input: {
  candidateId: string
  subjectId?: string | null
  operation: 'prepare_dataset' | 'train'
  idempotencyKey: string
  jobId: string
  trainingMode?: TrainingMode
  revisionKey?: string | null
  now?: Date
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const now = input.now || new Date()
  const evidence = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    claim: 'training_job_dispatched',
    candidateId: input.candidateId,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    jobId: input.jobId,
    trainingMode: input.trainingMode || null,
    revisionKey: input.revisionKey || null,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const eventKey = hash([COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE, 'dispatch', input.idempotencyKey, input.jobId])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId || null,
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'host_controller',
    observed_at: now.toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

type DispatchPort = (url: string, init: RequestInit) => Promise<Response>

async function dispatchSignedJob(input: {
  body: Record<string, unknown>
  idempotencyKey: string
  fetchImpl?: DispatchPort
  now?: Date
}) {
  const config = trainingExecutorConfigFromEnv()
  if (!config) throw new Error('training_executor_not_configured')
  if (!config.dispatchEnabled) throw new Error('training_executor_dispatch_disabled')
  const rawBody = JSON.stringify(input.body)
  const timestamp = (input.now || new Date()).toISOString()
  const signature = signTrainingExecutorPayload({ secret: config.secret, timestamp, idempotencyKey: input.idempotencyKey, rawBody })
  const response = await (input.fetchImpl || fetch)(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-itmounts-training-profile': COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
      'x-itmounts-training-timestamp': timestamp,
      'x-itmounts-training-idempotency-key': input.idempotencyKey,
      'x-itmounts-training-signature': signature,
    },
    body: rawBody,
    redirect: 'error',
  })
  const responseBody = await response.text()
  const responseTimestamp = response.headers.get('x-itmounts-training-timestamp') || ''
  const responseKey = response.headers.get('x-itmounts-training-idempotency-key') || ''
  const responseSignature = response.headers.get('x-itmounts-training-signature') || ''
  if (!response.ok) throw new Error(`training_executor_rejected:${response.status}`)
  if (responseKey !== input.idempotencyKey || !verifyTrainingExecutorPayload({
    secret: config.secret,
    timestamp: responseTimestamp,
    idempotencyKey: responseKey,
    rawBody: responseBody,
    signature: responseSignature,
  })) throw new Error('training_executor_response_signature_invalid')
  let payload: any = null
  try { payload = JSON.parse(responseBody) } catch { payload = null }
  const jobId = clean(payload?.jobId, 240)
  if (payload?.accepted !== true || !jobId) throw new Error('training_executor_response_invalid')
  return { accepted: true as const, jobId, idempotencyKey: input.idempotencyKey }
}

export async function dispatchUniversityDatasetPreparation(input: {
  candidateId: string
  baseModel: string
  confirmDispatch: unknown
  fetchImpl?: DispatchPort
}) {
  requireExplicitTrainingDispatchConfirmation(input.confirmDispatch)
  const plan = await readCandidatePlan(input.candidateId)
  const baseModel = clean(input.baseModel, 240)
  if (!baseModel) throw new Error('training_executor_base_model_missing')
  const datasetHash = controlledFineTuneDatasetHash(plan)
  const idempotencyKey = hash([COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE, 'prepare_dataset', input.candidateId, baseModel, datasetHash])
  const result = await dispatchSignedJob({
    idempotencyKey,
    fetchImpl: input.fetchImpl,
    body: {
      profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
      operation: 'prepare_dataset',
      candidateId: input.candidateId,
      subjectId: plan.subject_id,
      baseModel,
      datasetHash,
      candidate: controlledFineTuneDatasetDescriptor(plan),
      callbackPath: '/api/internal/cos/university-training-executor/evidence',
      authorityExpanded: false,
    },
  })
  await recordDispatchAudit({ candidateId: input.candidateId, subjectId: plan.subject_id, operation: 'prepare_dataset', idempotencyKey, jobId: result.jobId })
  return { ...result, operation: 'prepare_dataset' as const, candidateId: input.candidateId, datasetHash }
}

export function validateDistillationTrainingBinding(input: {
  candidate: ModelDistillationCandidateInput
  revision: FineTuneRevision
}) {
  const decision = decideModelDistillationCandidate(input.candidate)
  const blockers = [...decision.blockers]
  if (input.candidate.datasetHash !== input.revision.datasetHash) blockers.push('controlled_dataset_mismatch')
  if (clean(input.candidate.studentModelId) !== clean(input.revision.baseModel)) blockers.push('controlled_student_model_mismatch')
  return Object.freeze({ eligible: blockers.length === 0, blockers: Object.freeze([...new Set(blockers)]) })
}

export async function dispatchUniversityApprovedTraining(input: {
  candidateId: string
  revision: FineTuneRevision
  trainingMode: TrainingMode
  confirmDispatch: unknown
  distillation?: ModelDistillationCandidateInput | null
  fetchImpl?: DispatchPort
}) {
  requireExplicitTrainingDispatchConfirmation(input.confirmDispatch)
  if (!validRevision(input.revision)) throw new Error('training_executor_revision_invalid')
  const plan = await readCandidatePlan(input.candidateId)
  const canonicalDatasetHash = controlledFineTuneDatasetHash(plan)
  if (input.revision.datasetHash !== canonicalDatasetHash) throw new Error('training_executor_dataset_identity_mismatch')
  const recorded = await readFineTuneEvidence(input.candidateId, input.revision)
  const controlled = decideControlledFineTune(buildFineTuneEvidenceInput(input.revision, recorded))
  if (!controlled.eligibleForTraining) throw new Error(`training_executor_controlled_gate_blocked:${controlled.blockers.join(',')}`)
  const materialization = await readPartitionMaterialization(input.candidateId, input.revision)
  if (!materialization) throw new Error('training_executor_partition_materialization_missing')

  let distillation: ModelDistillationCandidateInput | null = null
  if (input.trainingMode === 'distillation') {
    if (!input.distillation) throw new Error('training_executor_distillation_candidate_missing')
    const binding = validateDistillationTrainingBinding({ candidate: input.distillation, revision: input.revision })
    if (!binding.eligible) throw new Error(`training_executor_distillation_blocked:${binding.blockers.join(',')}`)
    distillation = input.distillation
  } else if (input.trainingMode !== 'fine_tune') {
    throw new Error('training_executor_mode_invalid')
  }

  const revisionKey = fineTuneRevisionKey(input.revision)
  const idempotencyKey = hash([COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE, 'train', input.trainingMode, input.candidateId, revisionKey])
  const result = await dispatchSignedJob({
    idempotencyKey,
    fetchImpl: input.fetchImpl,
    body: {
      profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
      operation: 'train',
      trainingMode: input.trainingMode,
      candidateId: input.candidateId,
      subjectId: plan.subject_id,
      revision: input.revision,
      revisionKey,
      trainingDataRef: materialization.trainingDataRef,
      holdoutDataRef: materialization.holdoutDataRef,
      distillation: distillation ? {
        teacherModelId: distillation.teacherModelId,
        studentModelId: distillation.studentModelId,
        datasetHash: distillation.datasetHash,
        provenanceRefs: distillation.provenanceRefs,
        trainingRights: distillation.trainingRights,
        studentControlledByBuyer: distillation.studentControlledByBuyer,
        containsPrivateProductionData: distillation.containsPrivateProductionData,
      } : null,
      callbackPath: '/api/internal/cos/university-training-executor/evidence',
      authorityExpanded: false,
    },
  })
  await recordDispatchAudit({ candidateId: input.candidateId, subjectId: plan.subject_id, operation: 'train', trainingMode: input.trainingMode, revisionKey, idempotencyKey, jobId: result.jobId })
  return { ...result, operation: 'train' as const, trainingMode: input.trainingMode, candidateId: input.candidateId, revisionKey }
}

export async function recordUniversityTrainingExecutorEvidence(input: any) {
  const claim = clean(input?.claim, 80) as TrainingExecutorClaim
  if (!TRAINING_EXECUTOR_CLAIMS.includes(claim)) throw new Error('training_executor_claim_not_permitted')
  const candidateId = clean(input?.candidateId, 100)
  // A valid asynchronous callback may arrive after study moved to another state. Preserve the
  // original fine-tune-candidate authorization without requiring the academic plan to remain active.
  const plan = await readCandidatePlan(candidateId, { requireActive: false })
  const evidenceRef = clean(input?.evidenceRef, 2000)
  if (!evidenceRef) throw new Error('training_executor_evidence_ref_missing')

  if (claim === 'partition_manifests_registered') {
    const materialized = validateTrainingExecutorPartition(input)
    if (!materialized) throw new Error('training_executor_partition_invalid')
    if (materialized.revision.datasetHash !== controlledFineTuneDatasetHash(plan)) throw new Error('training_executor_dataset_identity_mismatch')
    const trainingDataRef = clean(input?.trainingDataRef, 2000)
    const holdoutDataRef = clean(input?.holdoutDataRef, 2000)
    if (!trainingDataRef || !holdoutDataRef) throw new Error('training_executor_partition_data_ref_missing')
    return recordExecutorEvent({
      candidateId,
      subjectId: plan.subject_id,
      claim,
      evidence: {
        evidenceRef,
        revisionKey: fineTuneRevisionKey(materialized.revision),
        baseModel: materialized.revision.baseModel,
        datasetHash: materialized.revision.datasetHash,
        trainingItemHashes: materialized.trainingItemHashes,
        holdoutItemHashes: materialized.holdoutItemHashes,
        trainingDataRef,
        holdoutDataRef,
      },
    })
  }

  const revision: FineTuneRevision = {
    baseModel: clean(input?.baseModel, 240),
    datasetHash: clean(input?.datasetHash, 64),
    trainingManifestHash: clean(input?.trainingManifestHash, 64),
    holdoutManifestHash: clean(input?.holdoutManifestHash, 64),
  }
  if (!validRevision(revision) || revision.datasetHash !== controlledFineTuneDatasetHash(plan)) throw new Error('training_executor_revision_invalid')
  const registeredRevision = await readFineTunePartitionRevision(candidateId, revision.datasetHash)
  if (!registeredRevision || fineTuneRevisionKey(registeredRevision) !== fineTuneRevisionKey(revision)) throw new Error('training_executor_partition_revision_missing')
  const trainedArtifactId = clean(input?.trainedArtifactId, 500)
  const artifactHash = clean(input?.artifactHash, 64).toLowerCase()
  if (!trainedArtifactId || !HASH.test(artifactHash)) throw new Error('training_executor_artifact_invalid')

  if (claim === 'trained_artifact_registered') {
    return recordExecutorEvent({
      candidateId,
      subjectId: plan.subject_id,
      claim,
      evidence: { evidenceRef, revisionKey: fineTuneRevisionKey(revision), trainedArtifactId, artifactHash },
    })
  }

  const recorded = await readFineTuneEvidence(candidateId, revision)
  if (recorded.trainedArtifactId !== trainedArtifactId || recorded.trainedArtifactHash !== artifactHash) {
    throw new Error('training_executor_rollback_artifact_binding_invalid')
  }
  const rollbackArtifactRef = clean(input?.rollbackArtifactRef, 2000)
  if (!rollbackArtifactRef) throw new Error('training_executor_rollback_ref_missing')
  return recordExecutorEvent({
    candidateId,
    subjectId: plan.subject_id,
    claim,
    evidence: { evidenceRef, revisionKey: fineTuneRevisionKey(revision), trainedArtifactId, artifactHash, rollbackArtifactRef },
  })
}
