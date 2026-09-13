import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  trainingExecutorConfigFromEnv,
} from './cosUniversityTrainingExecutor.ts'
import {
  buildHuggingFaceJobSpec,
  decodeHuggingFaceDatasetRef,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceNamespace,
  submitHuggingFaceJob,
} from './cosUniversityHuggingFaceJobs.ts'
import {
  controlledFineTuneDatasetDescriptor,
  controlledFineTuneDatasetHash,
} from './cosUniversityTrainingIdentity.ts'
import type { OneTimeDatasetPreparationCapability } from './cosUniversityOneTimeDatasetPreparationDispatch.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMMIT = /^[a-f0-9]{40}$/i

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
  if (!match || !UUID.test(match[1])) throw new Error('one_time_dataset_preparation_candidate_id_invalid')
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
    throw new Error('one_time_dataset_preparation_candidate_not_authorized')
  }
  return plan
}

async function recordDispatchAudit(input: {
  candidateId: string
  subjectId: string
  idempotencyKey: string
  jobId: string
  baseModel: string
  datasetHash: string
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    claim: 'training_job_dispatched',
    candidateId: input.candidateId,
    operation: 'prepare_dataset',
    idempotencyKey: input.idempotencyKey,
    jobId: input.jobId,
    trainingMode: null,
    revisionKey: null,
    baseModel: input.baseModel,
    datasetHash: input.datasetHash,
    distillationCandidate: null,
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

export type OneTimeDatasetPreparationAccepted = Readonly<{
  accepted: true
  operation: 'prepare_dataset'
  candidateId: string
  jobId: string
  jobUrl: string
  baseModel: string
  datasetHash: string
  flavor: string
  hourlyCostUsd: number
  timeoutSeconds: number
  maxEstimatedCostUsd: number
  studentTrainingAuthorized: false
  auditRecorded: boolean
}>

export class OneTimeDatasetPreparationProviderAcceptedAuditError extends Error {
  readonly acceptedDispatch: OneTimeDatasetPreparationAccepted
  readonly auditError: string

  constructor(acceptedDispatch: OneTimeDatasetPreparationAccepted, cause: unknown) {
    super('one_time_dataset_preparation_provider_accepted_audit_pending')
    this.name = 'OneTimeDatasetPreparationProviderAcceptedAuditError'
    this.acceptedDispatch = acceptedDispatch
    this.auditError = cause instanceof Error ? clean(cause.message, 240) : clean(cause, 240)
  }
}

export function isOneTimeDatasetPreparationProviderAcceptedAuditError(value: unknown): value is OneTimeDatasetPreparationProviderAcceptedAuditError {
  return value instanceof OneTimeDatasetPreparationProviderAcceptedAuditError
}

/** Execute exactly one already-approved CPU dataset-partition job without enabling persistent dispatch. */
export async function dispatchApprovedOneTimeDatasetPreparation(input: {
  capability: OneTimeDatasetPreparationCapability
  fetchImpl?: typeof fetch
}): Promise<OneTimeDatasetPreparationAccepted> {
  const approval = input.capability
  if (approval.operation !== 'prepare_dataset'
    || approval.studentTrainingAuthorized !== false
    || approval.authorityExpanded !== false
    || Date.parse(approval.expiresAt) <= Date.now()) {
    throw new Error('one_time_dataset_preparation_capability_invalid')
  }

  const plan = await readCandidatePlan(approval.candidateId)
  const distillation = record(record(plan.evidence).distillationCandidate)
  if (clean(distillation.studentModelId, 240) !== approval.baseModel) {
    throw new Error('one_time_dataset_preparation_student_model_mismatch')
  }
  const descriptor = controlledFineTuneDatasetDescriptor(plan)
  const source = clean((descriptor as any).source, 2000)
  const decoded = decodeHuggingFaceDatasetRef(source)
  if (!decoded || !decoded.revision || !COMMIT.test(decoded.revision)) {
    throw new Error('one_time_dataset_preparation_immutable_source_required')
  }
  const datasetHash = controlledFineTuneDatasetHash(plan)

  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const hf = huggingFaceJobsConfigFromEnv()
  if (!executor || !hf) throw new Error('one_time_dataset_preparation_huggingface_not_configured')

  const hardware = await resolveHuggingFaceHardwareRate({ flavor: hf.preparationFlavor, token: hf.token, fetchImpl: input.fetchImpl })
  const hourlyCeiling = Math.min(hf.maxHourlyCostUsd, approval.maxHourlyCostUsd)
  if (!Number.isFinite(hardware.hourlyCostUsd) || hardware.hourlyCostUsd <= 0 || hardware.hourlyCostUsd > hourlyCeiling) {
    throw new Error('one_time_dataset_preparation_hourly_cost_cap_exceeded')
  }
  const budgetSeconds = Math.floor(approval.maxEstimatedCostUsd * 3600 / hardware.hourlyCostUsd)
  const timeoutSeconds = Math.min(hf.preparationTimeoutSeconds, budgetSeconds)
  if (timeoutSeconds < 60) throw new Error('one_time_dataset_preparation_total_cost_budget_too_small')
  const maxEstimatedCostUsd = Number((hardware.hourlyCostUsd * timeoutSeconds / 3600).toFixed(6))
  if (maxEstimatedCostUsd > approval.maxEstimatedCostUsd + 1e-9) {
    throw new Error('one_time_dataset_preparation_total_cost_cap_exceeded')
  }

  const idempotencyKey = hash([
    COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    'prepare_dataset',
    approval.candidateId,
    approval.baseModel,
    datasetHash,
  ])
  const envelope = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    operation: 'prepare_dataset',
    candidateId: approval.candidateId,
    subjectId: plan.subject_id,
    baseModel: approval.baseModel,
    datasetHash,
    candidate: descriptor,
    callbackPath: '/api/internal/cos/university-training-executor/evidence',
    authorityExpanded: false,
  }
  const boundedConfig = Object.freeze({ ...hf, preparationTimeoutSeconds: timeoutSeconds })
  const callbackUrl = new URL('/api/internal/cos/university-training-executor/evidence', executor.url).toString()
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl,
    idempotencyKey,
    callbackSecret: executor.secret,
    config: boundedConfig,
  })
  if (spec.flavor !== hardware.flavor || spec.timeoutSeconds !== timeoutSeconds) {
    throw new Error('one_time_dataset_preparation_job_spec_cost_binding_mismatch')
  }

  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl: input.fetchImpl })
  const submitted = await submitHuggingFaceJob({ namespace, token: hf.token, spec, fetchImpl: input.fetchImpl })
  const acceptedDispatch: OneTimeDatasetPreparationAccepted = Object.freeze({
    accepted: true,
    operation: 'prepare_dataset',
    candidateId: approval.candidateId,
    jobId: submitted.jobId,
    jobUrl: submitted.jobUrl,
    baseModel: approval.baseModel,
    datasetHash,
    flavor: hardware.flavor,
    hourlyCostUsd: hardware.hourlyCostUsd,
    timeoutSeconds,
    maxEstimatedCostUsd,
    studentTrainingAuthorized: false,
    auditRecorded: false,
  })

  try {
    await recordDispatchAudit({
      candidateId: approval.candidateId,
      subjectId: String(plan.subject_id),
      idempotencyKey,
      jobId: submitted.jobId,
      baseModel: approval.baseModel,
      datasetHash,
    })
  } catch (error) {
    throw new OneTimeDatasetPreparationProviderAcceptedAuditError(acceptedDispatch, error)
  }

  return Object.freeze({ ...acceptedDispatch, auditRecorded: true })
}
