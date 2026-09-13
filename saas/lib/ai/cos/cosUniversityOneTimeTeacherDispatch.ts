import { createHash } from 'node:crypto'

export const COS_UNIVERSITY_ONE_TIME_TEACHER_DISPATCH_PROFILE = 'cos_university_one_time_teacher_dispatch_v1' as const
export const ONE_TIME_TEACHER_MAX_HOURLY_COST_USD = 1 as const
export const ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD = 0.20 as const
export const ONE_TIME_TEACHER_MAX_VALIDITY_MS = 15 * 60_000

const HASH = /^[a-f0-9]{64}$/i
const CANDIDATE = /^study-plan:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashObject(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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
  claimedEvidenceHash: string
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
 * This is a second, narrower spend gate for an individual teacher-dataset job. It never authorizes
 * model training. The receipt must be short-lived and may not exceed the hard $0.20 / $1-hour caps.
 */
export function validateOneTimeTeacherApprovalEvidence(
  evidenceLike: unknown,
  now = new Date(),
): OneTimeTeacherApprovalValidation {
  const evidence = record(evidenceLike)
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

/** Atomically claim a short-lived approval receipt using its hashed bearer token. */
export async function claimOneTimeTeacherDispatchApproval(rawToken: unknown): Promise<OneTimeTeacherDispatchCapability> {
  const eventKey = oneTimeTeacherApprovalEventKey(rawToken)
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')

  const result = await db.from('cos_university_learning_assurance_events')
    .select('event_key,candidate_id,evidence,evidence_hash,expires_at,verifier,event_type')
    .eq('event_key', eventKey)
    .eq('event_type', 'fine_tune')
    .eq('verifier', 'host_controller')
    .maybeSingle()
  if (result.error) throw result.error
  const row: any = result.data
  if (!row || !HASH.test(clean(row.evidence_hash, 64))) throw new Error('one_time_teacher_approval_not_found')

  const validated = validateOneTimeTeacherApprovalEvidence(row.evidence)
  if (!validated.eligible) throw new Error(validated.blockers[0] || 'one_time_teacher_approval_invalid')
  if (clean(row.candidate_id, 120) !== validated.candidateId) throw new Error('one_time_teacher_approval_candidate_mismatch')
  if (row.expires_at && Date.parse(String(row.expires_at)) <= Date.now()) throw new Error('one_time_teacher_approval_expired')

  const claimedAt = new Date().toISOString()
  const claimedEvidence = {
    ...record(row.evidence),
    status: 'claimed',
    claimedAt,
  }
  const claimedEvidenceHash = hashObject(claimedEvidence)
  const update = await db.from('cos_university_learning_assurance_events')
    .update({ evidence: claimedEvidence, evidence_hash: claimedEvidenceHash })
    .eq('event_key', eventKey)
    .eq('evidence_hash', row.evidence_hash)
    .select('event_key')
  if (update.error) throw update.error
  if (!Array.isArray(update.data) || update.data.length !== 1) throw new Error('one_time_teacher_approval_already_claimed')

  return Object.freeze({
    eventKey,
    candidateId: validated.candidateId,
    maxHourlyCostUsd: validated.maxHourlyCostUsd,
    maxEstimatedCostUsd: validated.maxEstimatedCostUsd,
    expiresAt: validated.expiresAt,
    claimedEvidenceHash,
    operation: 'generate_teacher_dataset',
    studentTrainingAuthorized: false,
    authorityExpanded: false,
  })
}

export async function finishOneTimeTeacherDispatchApproval(input: {
  capability: OneTimeTeacherDispatchCapability
  status: 'dispatched' | 'failed'
  jobId?: string | null
  jobUrl?: string | null
  error?: string | null
}) {
  const db = await serviceDb()
  if (!db) throw new Error('service_database_unavailable')
  const existing = await db.from('cos_university_learning_assurance_events')
    .select('evidence,evidence_hash')
    .eq('event_key', input.capability.eventKey)
    .eq('evidence_hash', input.capability.claimedEvidenceHash)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (!existing.data) throw new Error('one_time_teacher_approval_claim_fence_lost')

  const evidence = {
    ...record((existing.data as any).evidence),
    status: input.status,
    completedAt: new Date().toISOString(),
    jobId: clean(input.jobId, 240) || null,
    jobUrl: clean(input.jobUrl, 2000) || null,
    error: clean(input.error, 200) || null,
  }
  const update = await db.from('cos_university_learning_assurance_events')
    .update({ evidence, evidence_hash: hashObject(evidence) })
    .eq('event_key', input.capability.eventKey)
    .eq('evidence_hash', input.capability.claimedEvidenceHash)
    .select('event_key')
  if (update.error) throw update.error
  if (!Array.isArray(update.data) || update.data.length !== 1) throw new Error('one_time_teacher_approval_finalize_fence_lost')
  return Object.freeze({ status: input.status, eventKey: input.capability.eventKey })
}
