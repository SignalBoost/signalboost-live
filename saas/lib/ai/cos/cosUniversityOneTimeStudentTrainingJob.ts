import { createHash } from 'node:crypto'
import { decideControlledFineTune } from './cosUniversityLearningAssurance.ts'
import {
  buildFineTuneEvidenceInput,
  fineTuneRevisionKey,
  readFineTuneEvidence,
  readFineTunePartitionRevision,
  recordFineTuneHostApproval,
  type FineTuneRevision,
} from './cosUniversityFineTuneEvidence.ts'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  trainingExecutorConfigFromEnv,
  validateDistillationTrainingBinding,
  validateTrainingExecutorPartition,
} from './cosUniversityTrainingExecutor.ts'
import {
  buildHuggingFaceJobSpec,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceNamespace,
  submitHuggingFaceJob,
} from './cosUniversityHuggingFaceJobs.ts'
import { controlledFineTuneDatasetHash } from './cosUniversityTrainingIdentity.ts'
import type { ModelDistillationCandidateInput } from './cosUniversityModelDistillation.ts'
import type { OneTimeStudentTrainingCapability } from './cosUniversityOneTimeStudentTrainingDispatch.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function serviceDb() {
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  return cosServiceDb()
}

function planUuid(candidateId: string): string {
  const match = /^study-plan:([0-9a-f-]+)$/i.exec(clean(candidateId, 120))
  if (!match || !UUID.test(match[1])) throw new Error('one_time_student_training_candidate_id_invalid')
  return match[1]
}

async function readCandidatePlan(candidateId: string) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,subject_id,failure_class,objective,methods,source_ref,evidence,fine_tune_candidate,status')
    .eq('id', planUuid(candidateId)).maybeSingle()
  if (result.error) throw result.error
  const plan: any = result.data
  if (!plan || plan.fine_tune_candidate !== true || !['queued', 'studying', 'ready_for_exam'].includes(String(plan.status))) {
    throw new Error('one_time_student_training_candidate_not_authorized')
  }
  return plan
}

function normalizedDistillationCandidate(value: unknown): ModelDistillationCandidateInput | null {
  const row = record(value)
  if (!Object.keys(row).length) return null
  return {
    teacherModelId: clean(row.teacherModelId, 240),
    studentModelId: clean(row.studentModelId, 240),
    datasetHash: clean(row.datasetHash, 64).toLowerCase(),
    provenanceRefs: Array.isArray(row.provenanceRefs)
      ? [...new Set(row.provenanceRefs.map(item => clean(item, 1000)).filter(Boolean))]
      : [],
    trainingRights: clean(row.trainingRights, 80) as ModelDistillationCandidateInput['trainingRights'],
    studentControlledByBuyer: row.studentControlledByBuyer === true,
    containsPrivateProductionData: row.containsPrivateProductionData === true,
    repeatedFailures: Number(row.repeatedFailures),
    independentRetestFailures: Number(row.independentRetestFailures),
  }
}

async function readPartitionMaterialization(candidateId: string, revision: FineTuneRevision) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .order('observed_at', { ascending: false })
    .limit(200)
  if (result.error) throw result.error
  const expectedKey = fineTuneRevisionKey(revision)
  for (const row of result.data || []) {
    const evidence = row.evidence as Record<string, unknown> | null
    const observedAt = Date.parse(String(row.observed_at || ''))
    if (row.verifier !== 'training_executor'
      || evidence?.profile !== 'cos_university_fine_tune_evidence_v1'
      || evidence?.claim !== 'partition_manifests_registered'
      || evidence?.revisionKey !== expectedKey
      || !Number.isFinite(observedAt) || observedAt > Date.now()
      || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) continue
    const materialized = validateTrainingExecutorPartition({
      baseModel: evidence?.baseModel,
      datasetHash: evidence?.datasetHash,
      trainingItemHashes: evidence?.trainingItemHashes,
      holdoutItemHashes: evidence?.holdoutItemHashes,
    })
    if (!materialized || fineTuneRevisionKey(materialized.revision) !== expectedKey) continue
    const trainingDataRef = clean(evidence?.trainingDataRef, 2000)
    const holdoutDataRef = clean(evidence?.holdoutDataRef, 2000)
    const evidenceRef = clean(evidence?.evidenceRef, 2000)
    if (trainingDataRef && holdoutDataRef && evidenceRef) {
      return Object.freeze({ trainingDataRef, holdoutDataRef, evidenceRef })
    }
  }
  return null
}

function distillationAuditSnapshot(candidate: ModelDistillationCandidateInput) {
  return {
    teacherModelId: candidate.teacherModelId,
    studentModelId: candidate.studentModelId,
    datasetHash: candidate.datasetHash,
    provenanceRefs: [...candidate.provenanceRefs],
    trainingRights: candidate.trainingRights,
    studentControlledByBuyer: candidate.studentControlledByBuyer,
    containsPrivateProductionData: candidate.containsPrivateProductionData,
    repeatedFailures: candidate.repeatedFailures,
    independentRetestFailures: candidate.independentRetestFailures,
  }
}

async function recordDispatchAudit(input: {
  candidateId: string
  subjectId: string
  idempotencyKey: string
  jobId: string
  revision: FineTuneRevision
  distillation: ModelDistillationCandidateInput
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const revisionKey = fineTuneRevisionKey(input.revision)
  const evidence = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    claim: 'training_job_dispatched',
    candidateId: input.candidateId,
    operation: 'train',
    idempotencyKey: input.idempotencyKey,
    jobId: input.jobId,
    trainingMode: 'distillation',
    revisionKey,
    baseModel: input.revision.baseModel,
    datasetHash: input.revision.datasetHash,
    distillationCandidate: distillationAuditSnapshot(input.distillation),
    authorityExpanded: false,
  }
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE, 'dispatch', input.idempotencyKey, input.jobId]),
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: input.candidateId,
    evidence_hash: hash(evidence),
    evidence,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export type OneTimeStudentTrainingAccepted = Readonly<{
  accepted: true
  operation: 'train'
  trainingMode: 'distillation'
  candidateId: string
  jobId: string
  jobUrl: string
  revisionKey: string
  flavor: string
  hourlyCostUsd: number
  timeoutSeconds: number
  maxEstimatedCostUsd: number
  automaticPromotionAuthorized: false
  auditRecorded: boolean
}>

export class OneTimeStudentTrainingProviderAcceptedAuditError extends Error {
  readonly acceptedDispatch: OneTimeStudentTrainingAccepted
  readonly auditError: string

  constructor(acceptedDispatch: OneTimeStudentTrainingAccepted, cause: unknown) {
    super('one_time_student_training_provider_accepted_audit_pending')
    this.name = 'OneTimeStudentTrainingProviderAcceptedAuditError'
    this.acceptedDispatch = acceptedDispatch
    this.auditError = cause instanceof Error ? clean(cause.message, 240) : clean(cause, 240)
  }
}

export function isOneTimeStudentTrainingProviderAcceptedAuditError(value: unknown): value is OneTimeStudentTrainingProviderAcceptedAuditError {
  return value instanceof OneTimeStudentTrainingProviderAcceptedAuditError
}

/** Execute exactly one approved distillation training job. Promotion remains independently gated. */
export async function dispatchApprovedOneTimeStudentTraining(input: {
  capability: OneTimeStudentTrainingCapability
  fetchImpl?: typeof fetch
}): Promise<OneTimeStudentTrainingAccepted> {
  const approval = input.capability
  if (approval.operation !== 'train'
    || approval.trainingMode !== 'distillation'
    || approval.studentTrainingAuthorized !== true
    || approval.automaticPromotionAuthorized !== false
    || approval.authorityExpanded !== false
    || Date.parse(approval.expiresAt) <= Date.now()) {
    throw new Error('one_time_student_training_capability_invalid')
  }

  const plan = await readCandidatePlan(approval.candidateId)
  const datasetHash = controlledFineTuneDatasetHash(plan)
  if (datasetHash !== approval.datasetHash) throw new Error('one_time_student_training_dataset_identity_mismatch')
  const revision = await readFineTunePartitionRevision(approval.candidateId, datasetHash)
  if (!revision) throw new Error('one_time_student_training_partition_revision_missing')
  const revisionKey = fineTuneRevisionKey(revision)
  if (revisionKey !== approval.revisionKey || revision.baseModel !== approval.baseModel) {
    throw new Error('one_time_student_training_revision_binding_mismatch')
  }

  const distillation = normalizedDistillationCandidate(record(plan.evidence).distillationCandidate)
  if (!distillation) throw new Error('one_time_student_training_distillation_candidate_missing')
  const binding = validateDistillationTrainingBinding({ candidate: distillation, revision })
  if (!binding.eligible) throw new Error(`one_time_student_training_distillation_blocked:${binding.blockers.join(',')}`)
  const materialization = await readPartitionMaterialization(approval.candidateId, revision)
  if (!materialization) throw new Error('one_time_student_training_partition_materialization_missing')

  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const hf = huggingFaceJobsConfigFromEnv()
  if (!executor || !hf) throw new Error('one_time_student_training_huggingface_not_configured')
  if (hf.trainingFlavor !== approval.requiredFlavor) throw new Error('one_time_student_training_flavor_mismatch')
  const hardware = await resolveHuggingFaceHardwareRate({ flavor: hf.trainingFlavor, token: hf.token, fetchImpl: input.fetchImpl })
  if (hardware.flavor !== approval.requiredFlavor) throw new Error('one_time_student_training_hardware_mismatch')
  const hourlyCeiling = Math.min(hf.maxHourlyCostUsd, approval.maxHourlyCostUsd)
  if (!Number.isFinite(hardware.hourlyCostUsd) || hardware.hourlyCostUsd <= 0 || hardware.hourlyCostUsd > hourlyCeiling) {
    throw new Error('one_time_student_training_hourly_cost_cap_exceeded')
  }
  const budgetSeconds = Math.floor(approval.maxEstimatedCostUsd * 3600 / hardware.hourlyCostUsd)
  const timeoutSeconds = Math.min(hf.trainingTimeoutSeconds, budgetSeconds)
  if (timeoutSeconds < 900) throw new Error('one_time_student_training_total_cost_budget_too_small')
  const maxEstimatedCostUsd = Number((hardware.hourlyCostUsd * timeoutSeconds / 3600).toFixed(6))
  if (maxEstimatedCostUsd > approval.maxEstimatedCostUsd + 1e-9) {
    throw new Error('one_time_student_training_total_cost_cap_exceeded')
  }

  const approvalRef = `one-time-student-training:${approval.eventKey}`
  const datasetApproval = await recordFineTuneHostApproval({
    candidateId: approval.candidateId,
    subjectId: String(plan.subject_id),
    claim: 'dataset_approved',
    evidenceRef: `${approvalRef}:dataset`,
    revision,
  })
  if (!datasetApproval.ok) throw new Error(`one_time_student_training_dataset_approval_failed:${datasetApproval.problems.join(',')}`)
  const trainingApproval = await recordFineTuneHostApproval({
    candidateId: approval.candidateId,
    subjectId: String(plan.subject_id),
    claim: 'training_approved',
    evidenceRef: `${approvalRef}:execution`,
    revision,
  })
  if (!trainingApproval.ok) throw new Error(`one_time_student_training_execution_approval_failed:${trainingApproval.problems.join(',')}`)

  const recorded = await readFineTuneEvidence(approval.candidateId, revision)
  const controlled = decideControlledFineTune(buildFineTuneEvidenceInput(revision, recorded))
  if (!controlled.eligibleForTraining) {
    throw new Error(`one_time_student_training_controlled_gate_blocked:${controlled.blockers.join(',')}`)
  }

  const idempotencyKey = hash([
    COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    'train',
    'distillation',
    approval.candidateId,
    revisionKey,
  ])
  const envelope = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    operation: 'train',
    trainingMode: 'distillation',
    candidateId: approval.candidateId,
    subjectId: plan.subject_id,
    revision,
    revisionKey,
    trainingDataRef: materialization.trainingDataRef,
    holdoutDataRef: materialization.holdoutDataRef,
    distillation: distillationAuditSnapshot(distillation),
    callbackPath: '/api/internal/cos/university-training-executor/evidence',
    authorityExpanded: false,
  }
  const boundedConfig = Object.freeze({ ...hf, trainingTimeoutSeconds: timeoutSeconds })
  const callbackUrl = new URL('/api/internal/cos/university-training-executor/evidence', executor.url).toString()
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl,
    idempotencyKey,
    callbackSecret: executor.secret,
    config: boundedConfig,
  })
  if (spec.flavor !== hardware.flavor || spec.timeoutSeconds !== timeoutSeconds) {
    throw new Error('one_time_student_training_job_spec_cost_binding_mismatch')
  }

  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl: input.fetchImpl })
  const submitted = await submitHuggingFaceJob({ namespace, token: hf.token, spec, fetchImpl: input.fetchImpl })
  const acceptedDispatch: OneTimeStudentTrainingAccepted = Object.freeze({
    accepted: true,
    operation: 'train',
    trainingMode: 'distillation',
    candidateId: approval.candidateId,
    jobId: submitted.jobId,
    jobUrl: submitted.jobUrl,
    revisionKey,
    flavor: hardware.flavor,
    hourlyCostUsd: hardware.hourlyCostUsd,
    timeoutSeconds,
    maxEstimatedCostUsd,
    automaticPromotionAuthorized: false,
    auditRecorded: false,
  })

  try {
    await recordDispatchAudit({
      candidateId: approval.candidateId,
      subjectId: String(plan.subject_id),
      idempotencyKey,
      jobId: submitted.jobId,
      revision,
      distillation,
    })
  } catch (error) {
    throw new OneTimeStudentTrainingProviderAcceptedAuditError(acceptedDispatch, error)
  }

  return Object.freeze({ ...acceptedDispatch, auditRecorded: true })
}
