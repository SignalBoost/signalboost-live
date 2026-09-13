import { createHash } from 'node:crypto'

export const COS_UNIVERSITY_ONE_TIME_STUDENT_TRAINING_PROFILE = 'cos_university_one_time_student_training_v1' as const
export const ONE_TIME_STUDENT_TRAINING_MAX_HOURLY_COST_USD = 0.41 as const
export const ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD = 1.61 as const
export const ONE_TIME_STUDENT_TRAINING_MAX_VALIDITY_MS = 15 * 60_000
export const ONE_TIME_STUDENT_TRAINING_REQUIRED_FLAVOR = 't4-small' as const

const CANDIDATE = /^study-plan:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/i

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function serviceDb() {
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  return cosServiceDb()
}

export type OneTimeStudentTrainingCapability = Readonly<{
  eventKey: string
  candidateId: string
  baseModel: string
  datasetHash: string
  revisionKey: string
  requiredFlavor: typeof ONE_TIME_STUDENT_TRAINING_REQUIRED_FLAVOR
  maxHourlyCostUsd: number
  maxEstimatedCostUsd: number
  expiresAt: string
  claimedAt: string
  operation: 'train'
  trainingMode: 'distillation'
  studentTrainingAuthorized: true
  automaticPromotionAuthorized: false
  authorityExpanded: false
}>

export function oneTimeStudentTrainingApprovalEventKey(rawToken: unknown): string {
  const token = clean(rawToken, 512)
  if (token.length < 32) throw new Error('one_time_student_training_approval_token_invalid')
  return hashText(token)
}

export async function claimOneTimeStudentTrainingApproval(rawToken: unknown): Promise<OneTimeStudentTrainingCapability> {
  const eventKey = oneTimeStudentTrainingApprovalEventKey(rawToken)
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')

  const result = await db.rpc('claim_cos_university_one_time_student_training', { p_token_hash: eventKey })
  if (result.error) {
    const message = clean(result.error.message, 240)
    if (message.includes('one_time_student_training_approval_')) {
      throw new Error(message.match(/one_time_student_training_approval_[a-z_]+/)?.[0] || 'one_time_student_training_approval_unavailable')
    }
    throw result.error
  }

  const row: any = Array.isArray(result.data) ? result.data[0] : result.data
  const candidateId = clean(row?.candidate_id, 120)
  const baseModel = clean(row?.base_model, 240)
  const datasetHash = clean(row?.dataset_hash, 64).toLowerCase()
  const revisionKey = clean(row?.revision_key, 64).toLowerCase()
  const requiredFlavor = clean(row?.required_flavor, 80)
  const expiresAt = clean(row?.expires_at, 100)
  const claimedAt = clean(row?.claimed_at, 100)
  const maxHourlyCostUsd = Number(row?.max_hourly_cost_usd)
  const maxEstimatedCostUsd = Number(row?.max_estimated_cost_usd)
  if (!CANDIDATE.test(candidateId)
    || !baseModel
    || !HASH.test(datasetHash)
    || !HASH.test(revisionKey)
    || requiredFlavor !== ONE_TIME_STUDENT_TRAINING_REQUIRED_FLAVOR
    || !Number.isFinite(Date.parse(expiresAt))
    || !Number.isFinite(Date.parse(claimedAt))
    || !Number.isFinite(maxHourlyCostUsd) || maxHourlyCostUsd <= 0 || maxHourlyCostUsd > ONE_TIME_STUDENT_TRAINING_MAX_HOURLY_COST_USD
    || !Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > ONE_TIME_STUDENT_TRAINING_MAX_ESTIMATED_COST_USD) {
    throw new Error('one_time_student_training_approval_claim_response_invalid')
  }

  return Object.freeze({
    eventKey,
    candidateId,
    baseModel,
    datasetHash,
    revisionKey,
    requiredFlavor: ONE_TIME_STUDENT_TRAINING_REQUIRED_FLAVOR,
    maxHourlyCostUsd,
    maxEstimatedCostUsd,
    expiresAt: new Date(expiresAt).toISOString(),
    claimedAt,
    operation: 'train',
    trainingMode: 'distillation',
    studentTrainingAuthorized: true,
    automaticPromotionAuthorized: false,
    authorityExpanded: false,
  })
}

export async function finishOneTimeStudentTrainingApproval(input: {
  capability: OneTimeStudentTrainingCapability
  status: 'dispatched' | 'failed'
  jobId?: string | null
  jobUrl?: string | null
  error?: string | null
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('finish_cos_university_one_time_student_training', {
    p_token_hash: input.capability.eventKey,
    p_claimed_at: input.capability.claimedAt,
    p_status: input.status,
    p_job_id: clean(input.jobId, 240) || null,
    p_job_url: clean(input.jobUrl, 2000) || null,
    p_error: clean(input.error, 200) || null,
  })
  if (result.error) {
    const message = clean(result.error.message, 240)
    if (message.includes('one_time_student_training_approval_')) {
      throw new Error(message.match(/one_time_student_training_approval_[a-z_]+/)?.[0] || 'one_time_student_training_approval_finalize_failed')
    }
    throw result.error
  }
  const row: any = Array.isArray(result.data) ? result.data[0] : result.data
  if (clean(row?.status, 32) !== input.status) throw new Error('one_time_student_training_approval_finalize_response_invalid')
  return Object.freeze({ status: input.status, eventKey: input.capability.eventKey })
}
