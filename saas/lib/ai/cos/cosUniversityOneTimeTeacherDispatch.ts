import { createHash } from 'node:crypto'

export const COS_UNIVERSITY_ONE_TIME_TEACHER_DISPATCH_PROFILE = 'cos_university_one_time_teacher_dispatch_v1' as const
export const ONE_TIME_TEACHER_MAX_HOURLY_COST_USD = 1 as const
export const ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD = 0.20 as const
export const ONE_TIME_TEACHER_MAX_VALIDITY_MS = 15 * 60_000

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

export type OneTimeTeacherDispatchCapability = Readonly<{
  eventKey: string
  candidateId: string
  maxHourlyCostUsd: number
  maxEstimatedCostUsd: number
  expiresAt: string
  claimedAt: string
  operation: 'generate_teacher_dataset'
  studentTrainingAuthorized: false
  authorityExpanded: false
}>

export type OneTimeTeacherApprovalValidation = Readonly<{
  eligible: boolean
  blockers: readonly string[]
  candidateId: string
  maxHourlyCostUsd: number
  maxEstimatedCostUsd: number
  expiresAt: string
}>

export function oneTimeTeacherApprovalEventKey(rawToken: unknown): string {
  const token = clean(rawToken, 512)
  if (token.length < 32) throw new Error('one_time_teacher_approval_token_invalid')
  return hashText(token)
}

/**
 * Pure validation for issuance/testing. Runtime claiming is performed atomically by the database RPC,
 * not by mutating the append-only University assurance ledger.
 */
export function validateOneTimeTeacherApprovalEvidence(
  evidenceLike: unknown,
  now = new Date(),
): OneTimeTeacherApprovalValidation {
  const evidence = evidenceLike && typeof evidenceLike === 'object' && !Array.isArray(evidenceLike)
    ? evidenceLike as Record<string, unknown>
    : {}
  const blockers: string[] = []
  const candidateId = clean(evidence.candidateId, 120)
  const authorizedAt = Date.parse(clean(evidence.authorizedAt, 100))
  const expiresAtText = clean(evidence.expiresAt, 100)
  const expiresAt = Date.parse(expiresAtText)
  const maxHourlyCostUsd = Number(evidence.maxHourlyCostUsd)
  const maxEstimatedCostUsd = Number(evidence.maxEstimatedCostUsd)

  if (evidence.profile !== COS_UNIVERSITY_ONE_TIME_TEACHER_DISPATCH_PROFILE) blockers.push('one_time_teacher_approval_profile_invalid')
  if (evidence.claim !== 'teacher_dataset_one_time_approval') blockers.push('one_time_teacher_approval_claim_invalid')
  if (evidence.operation !== 'generate_teacher_dataset') blockers.push('one_time_teacher_approval_operation_invalid')
  if (evidence.status !== 'pending') blockers.push('one_time_teacher_approval_not_pending')
  if (!CANDIDATE.test(candidateId)) blockers.push('one_time_teacher_approval_candidate_invalid')
  if (evidence.studentTrainingAuthorized !== false) blockers.push('one_time_teacher_student_training_forbidden')
  if (evidence.authorityExpanded !== false) blockers.push('one_time_teacher_authority_expansion_forbidden')
  if (!Number.isFinite(authorizedAt) || !Number.isFinite(expiresAt)) blockers.push('one_time_teacher_approval_time_invalid')
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) blockers.push('one_time_teacher_approval_expired')
  if (Number.isFinite(authorizedAt) && authorizedAt > now.getTime() + 60_000) blockers.push('one_time_teacher_approval_future_dated')
  if (Number.isFinite(authorizedAt) && Number.isFinite(expiresAt)
    && (expiresAt <= authorizedAt || expiresAt - authorizedAt > ONE_TIME_TEACHER_MAX_VALIDITY_MS)) {
    blockers.push('one_time_teacher_approval_window_invalid')
  }
  if (!Number.isFinite(maxHourlyCostUsd) || maxHourlyCostUsd <= 0 || maxHourlyCostUsd > ONE_TIME_TEACHER_MAX_HOURLY_COST_USD) {
    blockers.push('one_time_teacher_hourly_cost_cap_invalid')
  }
  if (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD) {
    blockers.push('one_time_teacher_total_cost_cap_invalid')
  }

  return Object.freeze({
    eligible: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
    candidateId,
    maxHourlyCostUsd,
    maxEstimatedCostUsd,
    expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : '',
  })
}

/**
 * Atomically claim a short-lived approval through the dedicated operational fence table. The RPC
 * also appends immutable claim evidence to cos_university_learning_assurance_events in the same DB
 * transaction. The raw bearer token never reaches storage; only its SHA-256 token hash is supplied.
 */
export async function claimOneTimeTeacherDispatchApproval(rawToken: unknown): Promise<OneTimeTeacherDispatchCapability> {
  const eventKey = oneTimeTeacherApprovalEventKey(rawToken)
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')

  const result = await db.rpc('claim_cos_university_one_time_teacher_dispatch', {
    p_token_hash: eventKey,
  })
  if (result.error) {
    const message = clean(result.error.message, 240)
    if (message.includes('one_time_teacher_approval_')) throw new Error(message.match(/one_time_teacher_approval_[a-z_]+/)?.[0] || 'one_time_teacher_approval_unavailable')
    throw result.error
  }
  const row: any = Array.isArray(result.data) ? result.data[0] : result.data
  const candidateId = clean(row?.candidate_id, 120)
  const expiresAt = clean(row?.expires_at, 100)
  const claimedAt = clean(row?.claimed_at, 100)
  const maxHourlyCostUsd = Number(row?.max_hourly_cost_usd)
  const maxEstimatedCostUsd = Number(row?.max_estimated_cost_usd)
  if (!CANDIDATE.test(candidateId)
    || !Number.isFinite(Date.parse(expiresAt))
    || !Number.isFinite(Date.parse(claimedAt))
    || !Number.isFinite(maxHourlyCostUsd) || maxHourlyCostUsd <= 0 || maxHourlyCostUsd > ONE_TIME_TEACHER_MAX_HOURLY_COST_USD
    || !Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD) {
    throw new Error('one_time_teacher_approval_claim_response_invalid')
  }

  return Object.freeze({
    eventKey,
    candidateId,
    maxHourlyCostUsd,
    maxEstimatedCostUsd,
    expiresAt: new Date(expiresAt).toISOString(),
    claimedAt: new Date(claimedAt).toISOString(),
    operation: 'generate_teacher_dataset',
    studentTrainingAuthorized: false,
    authorityExpanded: false,
  })
}

/** The finalize RPC is fenced to the exact claim timestamp and appends immutable terminal evidence. */
export async function finishOneTimeTeacherDispatchApproval(input: {
  capability: OneTimeTeacherDispatchCapability
  status: 'dispatched' | 'failed'
  jobId?: string | null
  jobUrl?: string | null
  error?: string | null
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('finish_cos_university_one_time_teacher_dispatch', {
    p_token_hash: input.capability.eventKey,
    p_claimed_at: input.capability.claimedAt,
    p_status: input.status,
    p_job_id: clean(input.jobId, 240) || null,
    p_job_url: clean(input.jobUrl, 2000) || null,
    p_error: clean(input.error, 200) || null,
  })
  if (result.error) {
    const message = clean(result.error.message, 240)
    if (message.includes('one_time_teacher_approval_')) throw new Error(message.match(/one_time_teacher_approval_[a-z_]+/)?.[0] || 'one_time_teacher_approval_finalize_failed')
    throw result.error
  }
  const row: any = Array.isArray(result.data) ? result.data[0] : result.data
  if (clean(row?.status, 32) !== input.status) throw new Error('one_time_teacher_approval_finalize_response_invalid')
  return Object.freeze({ status: input.status, eventKey: input.capability.eventKey })
}
