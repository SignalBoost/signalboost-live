import { createHash } from 'node:crypto'

export const COS_UNIVERSITY_ONE_TIME_DATASET_PREPARATION_PROFILE = 'cos_university_one_time_dataset_preparation_v1' as const
export const ONE_TIME_DATASET_PREPARATION_MAX_HOURLY_COST_USD = 0.05 as const
export const ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD = 0.015 as const
export const ONE_TIME_DATASET_PREPARATION_MAX_VALIDITY_MS = 15 * 60_000

const CANDIDATE = /^study-plan:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export type OneTimeDatasetPreparationCapability = Readonly<{
  eventKey: string
  candidateId: string
  baseModel: string
  maxHourlyCostUsd: number
  maxEstimatedCostUsd: number
  expiresAt: string
  claimedAt: string
  operation: 'prepare_dataset'
  studentTrainingAuthorized: false
  authorityExpanded: false
}>

export function oneTimeDatasetPreparationApprovalEventKey(rawToken: unknown): string {
  const token = clean(rawToken, 512)
  if (token.length < 32) throw new Error('one_time_dataset_preparation_approval_token_invalid')
  return hashText(token)
}

export async function claimOneTimeDatasetPreparationApproval(rawToken: unknown): Promise<OneTimeDatasetPreparationCapability> {
  const eventKey = oneTimeDatasetPreparationApprovalEventKey(rawToken)
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')

  const result = await db.rpc('claim_cos_university_one_time_dataset_preparation', {
    p_token_hash: eventKey,
  })
  if (result.error) {
    const message = clean(result.error.message, 240)
    if (message.includes('one_time_dataset_preparation_approval_')) {
      throw new Error(message.match(/one_time_dataset_preparation_approval_[a-z_]+/)?.[0] || 'one_time_dataset_preparation_approval_unavailable')
    }
    throw result.error
  }

  const row: any = Array.isArray(result.data) ? result.data[0] : result.data
  const candidateId = clean(row?.candidate_id, 120)
  const baseModel = clean(row?.base_model, 240)
  const expiresAt = clean(row?.expires_at, 100)
  const claimedAt = clean(row?.claimed_at, 100)
  const maxHourlyCostUsd = Number(row?.max_hourly_cost_usd)
  const maxEstimatedCostUsd = Number(row?.max_estimated_cost_usd)
  if (!CANDIDATE.test(candidateId)
    || !baseModel
    || !Number.isFinite(Date.parse(expiresAt))
    || !Number.isFinite(Date.parse(claimedAt))
    || !Number.isFinite(maxHourlyCostUsd) || maxHourlyCostUsd <= 0 || maxHourlyCostUsd > ONE_TIME_DATASET_PREPARATION_MAX_HOURLY_COST_USD
    || !Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > ONE_TIME_DATASET_PREPARATION_MAX_ESTIMATED_COST_USD) {
    throw new Error('one_time_dataset_preparation_approval_claim_response_invalid')
  }

  return Object.freeze({
    eventKey,
    candidateId,
    baseModel,
    maxHourlyCostUsd,
    maxEstimatedCostUsd,
    expiresAt: new Date(expiresAt).toISOString(),
    claimedAt,
    operation: 'prepare_dataset',
    studentTrainingAuthorized: false,
    authorityExpanded: false,
  })
}

export async function finishOneTimeDatasetPreparationApproval(input: {
  capability: OneTimeDatasetPreparationCapability
  status: 'dispatched' | 'failed'
  jobId?: string | null
  jobUrl?: string | null
  error?: string | null
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('finish_cos_university_one_time_dataset_preparation', {
    p_token_hash: input.capability.eventKey,
    p_claimed_at: input.capability.claimedAt,
    p_status: input.status,
    p_job_id: clean(input.jobId, 240) || null,
    p_job_url: clean(input.jobUrl, 2000) || null,
    p_error: clean(input.error, 200) || null,
  })
  if (result.error) {
    const message = clean(result.error.message, 240)
    if (message.includes('one_time_dataset_preparation_approval_')) {
      throw new Error(message.match(/one_time_dataset_preparation_approval_[a-z_]+/)?.[0] || 'one_time_dataset_preparation_approval_finalize_failed')
    }
    throw result.error
  }
  const row: any = Array.isArray(result.data) ? result.data[0] : result.data
  if (clean(row?.status, 32) !== input.status) throw new Error('one_time_dataset_preparation_approval_finalize_response_invalid')
  return Object.freeze({ status: input.status, eventKey: input.capability.eventKey })
}
