import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  trainingExecutorConfigFromEnv,
} from './cosUniversityTrainingExecutor.ts'
import {
  buildHuggingFaceJobSpec,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceModelMetadata,
  resolveHuggingFaceNamespace,
  submitHuggingFaceJob,
} from './cosUniversityHuggingFaceJobs.ts'
import {
  buildDistillationTeacherPromptSet,
  COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
  DEFAULT_DISTILLATION_STUDENT_MODEL,
  DEFAULT_DISTILLATION_TEACHER_MODEL,
  TEACHER_DATASET_CALLBACK_PATH,
} from './cosUniversityDistillationTeacherDataset.ts'
import type { OneTimeTeacherDispatchCapability } from './cosUniversityOneTimeTeacherDispatch.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function serviceDb() {
  const mod = await import('../../cos-core/storage/supabase.ts')
  return mod.cosServiceDb()
}

function planUuid(candidateId: string): string {
  const match = /^study-plan:([0-9a-f-]+)$/i.exec(clean(candidateId, 120))
  if (!match || !UUID.test(match[1])) throw new Error('one_time_teacher_candidate_id_invalid')
  return match[1]
}

async function readQualifiedPlan(candidateId: string) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,agent_id,subject_id,fine_tune_candidate,status,evidence')
    .eq('id', planUuid(candidateId)).maybeSingle()
  if (result.error) throw result.error
  const plan: any = result.data
  const qualification = record(record(plan?.evidence).distillationQualification)
  if (!plan || plan.fine_tune_candidate !== true || !['queued', 'studying', 'ready_for_exam'].includes(String(plan.status))) {
    throw new Error('one_time_teacher_candidate_not_authorized')
  }
  if (qualification.profile !== 'cos_university_distillation_preparation_v1'
    || qualification.eligible !== true
    || Number(qualification.repeatedFailures || 0) < 3
    || Number(qualification.independentRetestFailures || 0) < 2) {
    throw new Error('one_time_teacher_qualification_missing')
  }
  return plan as Readonly<{ id: string; agent_id: string; subject_id: string; evidence: unknown }>
}

async function recordTeacherAudit(input: {
  candidateId: string
  subjectId: string
  claim: 'teacher_dataset_dispatch_prepared' | 'teacher_dataset_job_dispatched'
  evidence: Record<string, unknown>
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
    authorityExpanded: false,
  }
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([COS_UNIVERSITY_TEACHER_DATASET_PROFILE, input.claim, input.candidateId, evidence]),
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

type DispatchPort = (url: string, init: RequestInit) => Promise<Response>

export type OneTimeTeacherDispatchAccepted = Readonly<{
  accepted: true
  operation: 'generate_teacher_dataset'
  candidateId: string
  jobId: string
  jobUrl: string
  teacherModel: string
  studentModel: string
  promptCount: number
  flavor: string
  hourlyCostUsd: number
  timeoutSeconds: number
  maxEstimatedCostUsd: number
  studentTrainingAuthorized: false
  auditRecorded: boolean
}>

/**
 * Once Hugging Face accepts a job, that consequence can never be downgraded to a replayable
 * pre-dispatch failure merely because the later host audit insert faults. The one-time receipt is
 * already consumed, and callers must finalize it as dispatched and reconcile the missing audit.
 */
export class OneTimeTeacherProviderAcceptedAuditError extends Error {
  readonly acceptedDispatch: OneTimeTeacherDispatchAccepted
  readonly auditError: string

  constructor(acceptedDispatch: OneTimeTeacherDispatchAccepted, cause: unknown) {
    super('one_time_teacher_provider_accepted_audit_pending')
    this.name = 'OneTimeTeacherProviderAcceptedAuditError'
    this.acceptedDispatch = acceptedDispatch
    this.auditError = cause instanceof Error ? clean(cause.message, 240) : clean(cause, 240)
  }
}

export function isOneTimeTeacherProviderAcceptedAuditError(value: unknown): value is OneTimeTeacherProviderAcceptedAuditError {
  return value instanceof OneTimeTeacherProviderAcceptedAuditError
}

/**
 * Execute exactly one already-approved teacher-dataset job without enabling the persistent global
 * dispatch switch. The short-lived capability is produced only by the atomically claimed ledger
 * receipt, is bound to one candidate, cannot authorize student training, and carries absolute cost
 * ceilings. The normal signed callback/audit path remains unchanged after submission.
 */
export async function dispatchApprovedOneTimeTeacherDataset(input: {
  capability: OneTimeTeacherDispatchCapability
  fetchImpl?: DispatchPort
}): Promise<OneTimeTeacherDispatchAccepted> {
  const approval = input.capability
  if (approval.operation !== 'generate_teacher_dataset'
    || approval.studentTrainingAuthorized !== false
    || approval.authorityExpanded !== false
    || Date.parse(approval.expiresAt) <= Date.now()) {
    throw new Error('one_time_teacher_capability_invalid')
  }

  const plan = await readQualifiedPlan(approval.candidateId)
  const prompts = buildDistillationTeacherPromptSet(plan.subject_id)
  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const hf = huggingFaceJobsConfigFromEnv()
  if (!executor || !hf) throw new Error('one_time_teacher_huggingface_not_configured')

  const teacherModelId = clean(process.env.COS_UNIVERSITY_HF_TEACHER_MODEL, 240) || DEFAULT_DISTILLATION_TEACHER_MODEL
  const studentModelId = clean(process.env.COS_UNIVERSITY_HF_STUDENT_MODEL, 240) || DEFAULT_DISTILLATION_STUDENT_MODEL
  const teacher = await resolveHuggingFaceModelMetadata({ modelId: teacherModelId, token: hf.token, fetchImpl: input.fetchImpl })
  const student = await resolveHuggingFaceModelMetadata({ modelId: studentModelId, token: hf.token, fetchImpl: input.fetchImpl })
  if (teacher.license !== 'apache-2.0' || student.license !== 'apache-2.0') {
    throw new Error('one_time_teacher_open_license_not_proven')
  }
  if (teacher.modelId === student.modelId) throw new Error('one_time_teacher_teacher_student_not_separated')

  const hardware = await resolveHuggingFaceHardwareRate({ flavor: hf.teacherFlavor, token: hf.token, fetchImpl: input.fetchImpl })
  const hourlyCeiling = Math.min(hf.maxHourlyCostUsd, approval.maxHourlyCostUsd)
  if (!Number.isFinite(hardware.hourlyCostUsd) || hardware.hourlyCostUsd <= 0 || hardware.hourlyCostUsd > hourlyCeiling) {
    throw new Error('one_time_teacher_hourly_cost_cap_exceeded')
  }

  const budgetSeconds = Math.floor(approval.maxEstimatedCostUsd * 3600 / hardware.hourlyCostUsd)
  const timeoutSeconds = Math.min(hf.teacherTimeoutSeconds, budgetSeconds)
  if (timeoutSeconds < 60) throw new Error('one_time_teacher_total_cost_budget_too_small')
  const maxEstimatedCostUsd = Number((hardware.hourlyCostUsd * timeoutSeconds / 3600).toFixed(6))
  if (maxEstimatedCostUsd > approval.maxEstimatedCostUsd + 1e-9) throw new Error('one_time_teacher_total_cost_cap_exceeded')

  const idempotencyKey = hash([
    COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    approval.candidateId,
    prompts.promptSetHash,
    teacher.modelId,
    teacher.revision,
    student.modelId,
    student.revision,
  ])
  const envelope = {
    profile: COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
    operation: 'generate_teacher_dataset',
    candidateId: approval.candidateId,
    subjectId: plan.subject_id,
    promptProfile: COS_UNIVERSITY_TEACHER_DATASET_PROFILE,
    promptSetHash: prompts.promptSetHash,
    prompts: prompts.prompts,
    teacher: { modelId: teacher.modelId, revision: teacher.revision, license: teacher.license },
    student: { modelId: student.modelId, revision: student.revision, license: student.license },
    trainingRights: 'open_license',
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    callbackPath: TEACHER_DATASET_CALLBACK_PATH,
    authorityExpanded: false,
  }
  const auditBase = {
    idempotencyKey,
    oneTimeApprovalEventKey: approval.eventKey,
    promptSetHash: prompts.promptSetHash,
    promptCount: prompts.prompts.length,
    teacherModelId: teacher.modelId,
    teacherModelRevision: teacher.revision,
    teacherLicense: teacher.license,
    studentModelId: student.modelId,
    studentModelRevision: student.revision,
    studentLicense: student.license,
    studentControlledByBuyer: true,
    containsPrivateProductionData: false,
    trainingRights: 'open_license',
    flavor: hardware.flavor,
    hourlyCostUsd: hardware.hourlyCostUsd,
    timeoutSeconds,
    maxEstimatedCostUsd,
  }
  await recordTeacherAudit({
    candidateId: approval.candidateId,
    subjectId: plan.subject_id,
    claim: 'teacher_dataset_dispatch_prepared',
    evidence: auditBase,
  })

  const boundedConfig = Object.freeze({ ...hf, teacherTimeoutSeconds: timeoutSeconds })
  const callbackUrl = new URL(TEACHER_DATASET_CALLBACK_PATH, executor.url).toString()
  const spec = buildHuggingFaceJobSpec({
    envelope,
    callbackUrl,
    idempotencyKey,
    callbackSecret: executor.secret,
    config: boundedConfig,
  })
  if (spec.flavor !== hardware.flavor || spec.timeoutSeconds !== timeoutSeconds) {
    throw new Error('one_time_teacher_job_spec_cost_binding_mismatch')
  }

  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl: input.fetchImpl })
  const submitted = await submitHuggingFaceJob({ namespace, token: hf.token, spec, fetchImpl: input.fetchImpl })
  const acceptedDispatch: OneTimeTeacherDispatchAccepted = Object.freeze({
    accepted: true,
    operation: 'generate_teacher_dataset',
    candidateId: approval.candidateId,
    jobId: submitted.jobId,
    jobUrl: submitted.jobUrl,
    teacherModel: `${teacher.modelId}@${teacher.revision}`,
    studentModel: `${student.modelId}@${student.revision}`,
    promptCount: prompts.prompts.length,
    flavor: hardware.flavor,
    hourlyCostUsd: hardware.hourlyCostUsd,
    timeoutSeconds,
    maxEstimatedCostUsd,
    studentTrainingAuthorized: false,
    auditRecorded: false,
  })

  try {
    await recordTeacherAudit({
      candidateId: approval.candidateId,
      subjectId: plan.subject_id,
      claim: 'teacher_dataset_job_dispatched',
      evidence: { ...auditBase, jobId: submitted.jobId, jobUrl: submitted.jobUrl },
    })
  } catch (error) {
    throw new OneTimeTeacherProviderAcceptedAuditError(acceptedDispatch, error)
  }

  return Object.freeze({ ...acceptedDispatch, auditRecorded: true })
}
