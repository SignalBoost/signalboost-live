import { createHash } from 'node:crypto'
import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import { incidentSchema, type SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import { COS_UNIVERSITY_MASS_DISTILLATION_CRON_PATH } from '../lib/ai/cos/cosUniversityMassDistillationContract.ts'
import { hostCronCadence } from './host-scheduler.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

export const UNIVERSITY_DISTILLATION_MONITOR_TARGET = 'cos-university:mass-distillation'
export const UNIVERSITY_DISTILLATION_HEALTH_ERROR_CODE = 'cos_university_mass_distillation_unhealthy'
export const UNIVERSITY_DISTILLATION_RECOVERY_TARGET = 'university.repair_mass_distillation'

type CampaignRow = {
  id: string
  status: string
  authorized_at: string
  expires_at: string
  max_total_cost_usd: number
  committed_cost_usd: number
}

type ReceiptRow = {
  observed_at: string
  commit_sha: string | null
  evidence: Record<string, unknown> | null
}

type WorkflowRunRow = {
  id: string
  campaign_id: string
  stage: string
  updated_at: string
  failure_reason: string | null
}
type ProviderJobRow = {
  campaign_id: string
  operation: string
  dispatched_at: string
  timeout_seconds: number
  provider_stage: string | null
}

type RollingContinuityInput = Readonly<{
  preparedBatches: number
  rollingPolicyEnabled: boolean
  rollingMaximumAuthorizedCostUsd: number | null
  rollingAuthorizedCostUsd: number
  nextBudgetReleaseAt: string | null
}>

export type CurriculumPackagingProgress = Readonly<{
  stalled: boolean
  observedAt: string | null
  subject: string | null
  shortfallToBatch: number
  insertedForSubject: number
  preparedBefore: number
  preparedAfter: number
}>

export type UniversityDistillationHealthReason =
  | 'heartbeat_missing'
  | 'heartbeat_stale'
  | 'workflow_failed'
  | 'campaign_failed'
  | 'claimable_stage_stalled'
  | 'dispatch_claim_stalled'
  | 'failed_stage_recovery_stalled'
  | 'provider_job_unsettled'
  | 'provider_job_overdue'
  | 'prepared_campaign_not_authorized'
  | 'curriculum_packaging_stalled'
  | 'curriculum_supply_waiting'
  | 'rolling_budget_exhausted'
  | 'rolling_authorization_disabled'

export interface UniversityDistillationHealthSnapshot {
  checkedAt: string
  state: 'healthy' | 'repair_required' | 'waiting_for_curriculum' | 'budget_paused' | 'authorization_required'
  reasons: UniversityDistillationHealthReason[]
  expectedIntervalSeconds: number
  maximumHeartbeatAgeSeconds: number
  activeCampaigns: number
  failedCampaigns: number
  activeCampaignIds: string[]
  latestReceiptAt: string | null
  latestCommitSha: string | null
  latestInvocationSucceeded: boolean | null
  receiptAgeSeconds: number | null
  workflowRuns: number
  claimableRuns: number
  stalledDispatchRuns: number
  workflowProgressAgeSeconds: number | null
  failedRuns: number
  staleFailedRuns: number
  unsettledProviderJobs: number
  overdueProviderJobs: number
  authorizedCostUsd: number
  committedCostUsd: number
  remainingAuthorizedCostUsd: number
  preparedBatches: number
  curriculumPackagingStalled: boolean
  curriculumProgressObservedAt: string | null
  curriculumProgressSubject: string | null
  curriculumProgressShortfallToBatch: number
  curriculumProgressInsertedForSubject: number
  curriculumProgressPreparedBefore: number
  curriculumProgressPreparedAfter: number
  rollingPolicyEnabled: boolean
  rollingMaximumAuthorizedCostUsd: number | null
  rollingCeilingRemoved: boolean
  rollingAuthorizedCostUsd: number
  rollingRemainingAuthorizedCostUsd: number | null
  nextBudgetReleaseAt: string | null
  automaticRecoveryAuthorized: boolean
  automaticPromotionAuthorized: false
  runpodMutationAuthorized: false
  authorityExpanded: false
}

const finite = (value: unknown): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const ageSeconds = (timestamp: unknown, nowMs: number): number | null => {
  const time = Date.parse(String(timestamp ?? ''))
  return Number.isFinite(time) ? Math.max(0, Math.floor((nowMs - time) / 1000)) : null
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)]

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function bySubjectInserted(value: unknown, subject: string): number {
  if (!Array.isArray(value)) return 0
  return value.reduce((sum, row) => {
    const item = record(row)
    return item && String(item.subject || '').trim() === subject
      ? sum + Math.max(0, Math.floor(finite(item.inserted)))
      : sum
  }, 0)
}

/**
 * Detect an exact upstream-to-downstream progress contradiction from the latest slow-maintenance
 * receipt. Empty supply alone is not a defect. The invariant trips only when the same canonical
 * subject received enough newly inserted curriculum to satisfy its recorded shortfall, yet the
 * packaging pass still produced no prepared batch.
 */
export function deriveCurriculumPackagingProgress(receipts: readonly ReceiptRow[]): CurriculumPackagingProgress {
  const maintenance = receipts.find(row => record(row.evidence)?.slowMaintenanceDue === true) || null
  if (!maintenance) {
    return Object.freeze({ stalled: false, observedAt: null, subject: null, shortfallToBatch: 0, insertedForSubject: 0, preparedBefore: 0, preparedAfter: 0 })
  }
  const evidence = record(maintenance.evidence) || {}
  const curriculum = record(evidence.curriculum) || {}
  const supply = record(curriculum.supply) || {}
  const replenishment = record(evidence.curriculumReplenishment) || {}
  const preparedBefore = Math.max(0, Math.floor(finite(evidence.preparedBeforeReplenishment)))
  const preparedAfter = Math.max(0, Math.floor(finite(evidence.preparedAfterReplenishment)))
  const batchesPrepared = Math.max(0, Math.floor(finite(curriculum.batchesPrepared)))
  if (preparedAfter > 0 || batchesPrepared > 0) {
    return Object.freeze({ stalled: false, observedAt: maintenance.observed_at, subject: null, shortfallToBatch: 0, insertedForSubject: 0, preparedBefore, preparedAfter })
  }

  const subjects = Array.isArray(supply.subjects) ? supply.subjects : []
  for (const raw of subjects) {
    const item = record(raw)
    const subject = String(item?.subject || '').trim()
    const shortfallToBatch = Math.max(0, Math.floor(finite(item?.shortfallToBatch)))
    if (!subject || shortfallToBatch <= 0) continue
    const insertedForSubject = [
      replenishment.syntheticBySubject,
      replenishment.failureDerivedBySubject,
      replenishment.hostedTeacherBySubject,
      replenishment.acceptedBySubject,
    ].reduce((sum, value) => sum + bySubjectInserted(value, subject), 0)
    if (insertedForSubject >= shortfallToBatch) {
      return Object.freeze({ stalled: true, observedAt: maintenance.observed_at, subject, shortfallToBatch, insertedForSubject, preparedBefore, preparedAfter })
    }
  }
  return Object.freeze({ stalled: false, observedAt: maintenance.observed_at, subject: null, shortfallToBatch: 0, insertedForSubject: 0, preparedBefore, preparedAfter })
}

export function evaluateUniversityMassDistillationHealth(input: {
  now: Date
  expectedIntervalSeconds: number
  campaigns: readonly CampaignRow[]
  receipt: ReceiptRow | null
  workflowRuns: readonly WorkflowRunRow[]
  providerJobs: readonly ProviderJobRow[]
  continuity?: RollingContinuityInput
  curriculumProgress?: CurriculumPackagingProgress
}): UniversityDistillationHealthSnapshot {
  const nowMs = input.now.getTime()
  const expectedIntervalSeconds = Math.max(60, Math.min(3600, Math.floor(input.expectedIntervalSeconds)))
  const maximumHeartbeatAgeSeconds = Math.max(15 * 60, expectedIntervalSeconds * 3)
  const failedRunGraceSeconds = Math.max(20 * 60, expectedIntervalSeconds * 4)
  const campaignIds = unique(input.campaigns.map(campaign => String(campaign.id)).filter(Boolean))
  const activeProviderJobs = input.providerJobs.filter(job => campaignIds.includes(String(job.campaign_id)))
  const failedCampaigns = input.campaigns.filter(campaign => campaign.status === 'failed')
  const evidence = input.receipt?.evidence && typeof input.receipt.evidence === 'object'
    ? input.receipt.evidence
    : null
  const receiptAgeSeconds = input.receipt ? ageSeconds(input.receipt.observed_at, nowMs) : null
  const invocationSucceeded = evidence && typeof evidence.invocationSucceeded === 'boolean'
    ? evidence.invocationSucceeded
    : null
  const failedRuns = input.workflowRuns.filter(run => run.stage === 'failed')
  const claimableRuns = input.workflowRuns.filter(run => ['teacher_pending', 'preparation_pending', 'training_pending'].includes(run.stage))
  const stalledDispatchRuns = input.workflowRuns.filter(run => {
    if (!['teacher_dispatching', 'preparation_dispatching', 'training_dispatching'].includes(run.stage)) return false
    const age = ageSeconds(run.updated_at, nowMs)
    return age != null && age > maximumHeartbeatAgeSeconds
  })
  const workflowActivityTimes = input.workflowRuns
    .map(run => Date.parse(String(run.updated_at || '')))
    .filter(Number.isFinite)
  const workflowProgressAgeSeconds = workflowActivityTimes.length
    ? Math.max(0, Math.floor((nowMs - Math.max(...workflowActivityTimes)) / 1000))
    : null
  const staleFailedRuns = failedRuns.filter(run => {
    const age = ageSeconds(run.updated_at, nowMs)
    return age != null && age > failedRunGraceSeconds
  })
  const overdueProviderJobs = input.providerJobs.filter(job => {
    const dispatchedAt = Date.parse(String(job.dispatched_at || ''))
    const timeoutSeconds = finite(job.timeout_seconds)
    const stage = String(job.provider_stage || '').toUpperCase()
    return Number.isFinite(dispatchedAt)
      && timeoutSeconds > 0
      && !['COMPLETED', 'CANCELED', 'ERROR', 'DELETED'].includes(stage)
      && nowMs > dispatchedAt + (timeoutSeconds + 120) * 1000
  })
  const authorizedCostUsd = input.campaigns.reduce((sum, campaign) => sum + finite(campaign.max_total_cost_usd), 0)
  const committedCostUsd = input.campaigns.reduce((sum, campaign) => sum + finite(campaign.committed_cost_usd), 0)
  const remainingAuthorizedCostUsd = Math.max(0, authorizedCostUsd - committedCostUsd)
  const preparedBatches = Math.max(0, Math.floor(finite(input.continuity?.preparedBatches)))
  const curriculumProgress = input.curriculumProgress ?? Object.freeze({ stalled: false, observedAt: null, subject: null, shortfallToBatch: 0, insertedForSubject: 0, preparedBefore: 0, preparedAfter: 0 })
  const curriculumPackagingStalled = curriculumProgress.stalled === true
  const rollingPolicyEnabled = input.continuity?.rollingPolicyEnabled === true
  const rollingCeilingRemoved = rollingPolicyEnabled && input.continuity?.rollingMaximumAuthorizedCostUsd == null
  const rollingMaximumAuthorizedCostUsd = rollingCeilingRemoved
    ? null
    : finite(input.continuity?.rollingMaximumAuthorizedCostUsd)
  const rollingAuthorizedCostUsd = finite(input.continuity?.rollingAuthorizedCostUsd)
  const rollingRemainingAuthorizedCostUsd = rollingCeilingRemoved
    ? null
    : Math.max(0, (rollingMaximumAuthorizedCostUsd ?? 0) - rollingAuthorizedCostUsd)
  const nextBudgetReleaseAt = rollingCeilingRemoved ? null : (input.continuity?.nextBudgetReleaseAt ?? null)

  if (campaignIds.length === 0) {
    const rollingBatchAffordable = rollingCeilingRemoved
      || (rollingRemainingAuthorizedCostUsd ?? 0) + 0.000001 >= 1.825
    const reasons: UniversityDistillationHealthReason[] = []
    let state: UniversityDistillationHealthSnapshot['state']
    let automaticRecoveryAuthorized = false
    if (!input.receipt) reasons.push('heartbeat_missing')
    else if (receiptAgeSeconds == null || receiptAgeSeconds > maximumHeartbeatAgeSeconds) reasons.push('heartbeat_stale')
    if (invocationSucceeded === false) reasons.push('workflow_failed')
    if (input.providerJobs.length > 0) reasons.push('provider_job_unsettled')
    if (overdueProviderJobs.length > 0) reasons.push('provider_job_overdue')
    if (reasons.length > 0) {
      state = 'repair_required'
      automaticRecoveryAuthorized = true
    } else if (!rollingPolicyEnabled) {
      state = 'authorization_required'
      reasons.push('rolling_authorization_disabled')
    } else if (!rollingBatchAffordable) {
      state = 'budget_paused'
      reasons.push('rolling_budget_exhausted')
    } else if (preparedBatches === 0 && curriculumPackagingStalled) {
      state = 'repair_required'
      reasons.push('curriculum_packaging_stalled')
      automaticRecoveryAuthorized = true
    } else if (preparedBatches === 0) {
      state = 'waiting_for_curriculum'
      reasons.push('curriculum_supply_waiting')
    } else {
      state = 'repair_required'
      reasons.push('prepared_campaign_not_authorized')
      automaticRecoveryAuthorized = true
    }
    return {
      checkedAt: input.now.toISOString(), state, reasons, expectedIntervalSeconds,
      maximumHeartbeatAgeSeconds, activeCampaigns: 0, failedCampaigns: 0, activeCampaignIds: [], latestReceiptAt: input.receipt?.observed_at ?? null,
      latestCommitSha: input.receipt?.commit_sha ?? null, latestInvocationSucceeded: invocationSucceeded,
      receiptAgeSeconds, workflowRuns: 0, claimableRuns: 0, stalledDispatchRuns: 0,
      workflowProgressAgeSeconds: null, failedRuns: 0, staleFailedRuns: 0,
      unsettledProviderJobs: input.providerJobs.length, overdueProviderJobs: overdueProviderJobs.length,
      authorizedCostUsd: 0, committedCostUsd: 0, remainingAuthorizedCostUsd: 0,
      preparedBatches,
      curriculumPackagingStalled,
      curriculumProgressObservedAt: curriculumProgress.observedAt,
      curriculumProgressSubject: curriculumProgress.subject,
      curriculumProgressShortfallToBatch: curriculumProgress.shortfallToBatch,
      curriculumProgressInsertedForSubject: curriculumProgress.insertedForSubject,
      curriculumProgressPreparedBefore: curriculumProgress.preparedBefore,
      curriculumProgressPreparedAfter: curriculumProgress.preparedAfter,
      rollingPolicyEnabled,
      rollingMaximumAuthorizedCostUsd: rollingMaximumAuthorizedCostUsd == null
        ? null
        : Number(rollingMaximumAuthorizedCostUsd.toFixed(6)),
      rollingCeilingRemoved,
      rollingAuthorizedCostUsd: Number(rollingAuthorizedCostUsd.toFixed(6)),
      rollingRemainingAuthorizedCostUsd: rollingRemainingAuthorizedCostUsd == null
        ? null
        : Number(rollingRemainingAuthorizedCostUsd.toFixed(6)),
      nextBudgetReleaseAt, automaticRecoveryAuthorized,
      automaticPromotionAuthorized: false, runpodMutationAuthorized: false,
      authorityExpanded: false,
    }
  }

  const reasons: UniversityDistillationHealthReason[] = []
  if (!input.receipt) reasons.push('heartbeat_missing')
  else if (receiptAgeSeconds == null || receiptAgeSeconds > maximumHeartbeatAgeSeconds) reasons.push('heartbeat_stale')
  if (invocationSucceeded === false) reasons.push('workflow_failed')
  if (failedCampaigns.length > 0) reasons.push('campaign_failed')
  if (claimableRuns.length > 0 && activeProviderJobs.length === 0
    && workflowProgressAgeSeconds != null && workflowProgressAgeSeconds > failedRunGraceSeconds) {
    reasons.push('claimable_stage_stalled')
  }
  if (stalledDispatchRuns.length > 0) reasons.push('dispatch_claim_stalled')
  if (staleFailedRuns.length > 0) reasons.push('failed_stage_recovery_stalled')
  if (overdueProviderJobs.length > 0) reasons.push('provider_job_overdue')

  const authorityIntact = input.campaigns.every(campaign => {
    const expiresAt = Date.parse(String(campaign.expires_at || ''))
    const maximum = finite(campaign.max_total_cost_usd)
    const committed = finite(campaign.committed_cost_usd)
    return ['authorized', 'active', 'failed'].includes(String(campaign.status))
      && Number.isFinite(expiresAt) && expiresAt > nowMs
      && maximum > 0 && committed >= 0 && committed <= maximum + 0.000001
  })

  return {
    checkedAt: input.now.toISOString(),
    state: reasons.length ? 'repair_required' : 'healthy',
    reasons,
    expectedIntervalSeconds,
    maximumHeartbeatAgeSeconds,
    activeCampaigns: campaignIds.length,
    failedCampaigns: failedCampaigns.length,
    activeCampaignIds: campaignIds,
    latestReceiptAt: input.receipt?.observed_at ?? null,
    latestCommitSha: input.receipt?.commit_sha ?? null,
    latestInvocationSucceeded: invocationSucceeded,
    receiptAgeSeconds,
    workflowRuns: input.workflowRuns.length,
    claimableRuns: claimableRuns.length,
    stalledDispatchRuns: stalledDispatchRuns.length,
    workflowProgressAgeSeconds,
    failedRuns: failedRuns.length,
    staleFailedRuns: staleFailedRuns.length,
    unsettledProviderJobs: input.providerJobs.length,
    overdueProviderJobs: overdueProviderJobs.length,
    authorizedCostUsd: Number(authorizedCostUsd.toFixed(6)),
    committedCostUsd: Number(committedCostUsd.toFixed(6)),
    remainingAuthorizedCostUsd: Number(remainingAuthorizedCostUsd.toFixed(6)),
    preparedBatches,
    curriculumPackagingStalled,
    curriculumProgressObservedAt: curriculumProgress.observedAt,
    curriculumProgressSubject: curriculumProgress.subject,
    curriculumProgressShortfallToBatch: curriculumProgress.shortfallToBatch,
    curriculumProgressInsertedForSubject: curriculumProgress.insertedForSubject,
    curriculumProgressPreparedBefore: curriculumProgress.preparedBefore,
    curriculumProgressPreparedAfter: curriculumProgress.preparedAfter,
    rollingPolicyEnabled,
    rollingMaximumAuthorizedCostUsd: rollingMaximumAuthorizedCostUsd == null
      ? null
      : Number(rollingMaximumAuthorizedCostUsd.toFixed(6)),
    rollingCeilingRemoved,
    rollingAuthorizedCostUsd: Number(rollingAuthorizedCostUsd.toFixed(6)),
    rollingRemainingAuthorizedCostUsd: rollingRemainingAuthorizedCostUsd == null
      ? null
      : Number(rollingRemainingAuthorizedCostUsd.toFixed(6)),
    nextBudgetReleaseAt,
    automaticRecoveryAuthorized: reasons.length > 0 && authorityIntact,
    automaticPromotionAuthorized: false,
    runpodMutationAuthorized: false,
    authorityExpanded: false,
  }
}

export async function readUniversityMassDistillationHealth(input: {
  db: any
  now?: Date
}): Promise<UniversityDistillationHealthSnapshot> {
  const now = input.now || new Date()
  const cadence = hostCronCadence(COS_UNIVERSITY_MASS_DISTILLATION_CRON_PATH)
  const expectedIntervalSeconds = cadence?.maximumIntervalSeconds ?? 60
  const windowStart = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  const [campaignsResult, receiptResult, progressReceiptsResult, policyResult, windowResult, preparedResult, providerResult] = await Promise.all([
    input.db.from('cos_university_mass_distillation_campaigns')
      .select('id,status,authorized_at,expires_at,max_total_cost_usd,committed_cost_usd')
      .in('status', ['authorized', 'active', 'failed'])
      .gt('expires_at', now.toISOString())
      .order('authorized_at', { ascending: true })
      .limit(100),
    input.db.from('cos_university_learning_assurance_events')
      .select('observed_at,commit_sha,evidence')
      .eq('event_type', 'production_path')
      .eq('path_id', 'mass_distillation_campaign')
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.db.from('cos_university_learning_assurance_events')
      .select('observed_at,commit_sha,evidence')
      .eq('event_type', 'production_path')
      .eq('path_id', 'mass_distillation_campaign')
      .gte('observed_at', new Date(now.getTime() - 30 * 60_000).toISOString())
      .order('observed_at', { ascending: false })
      .limit(30),
    input.db.from('cos_university_mass_distillation_rolling_policy')
      .select('enabled,max_authorized_cost_usd,rolling_window')
      .eq('policy_key', 'owner-rolling-24h-v1')
      .limit(1)
      .maybeSingle(),
    input.db.from('cos_university_mass_distillation_campaigns')
      .select('authorized_at,max_total_cost_usd')
      .gte('authorized_at', windowStart)
      .order('authorized_at', { ascending: true })
      .limit(500),
    input.db.from('cos_university_distillation_curriculum_batches')
      .select('batch_key')
      .eq('status', 'prepared')
      .eq('dispatch_authorized', false)
      .eq('authority_expanded', false)
      .eq('student_model_id', 'Qwen/Qwen3-4B')
      .gte('source_count', 20)
      .lte('source_count', 128)
      .order('prepared_at', { ascending: true })
      .limit(100),
    input.db.from('cos_university_mass_distillation_provider_jobs')
      .select('campaign_id,operation,dispatched_at,timeout_seconds,provider_stage')
      .is('settled_at', null)
      .order('dispatched_at', { ascending: true })
      .limit(200),
  ])
  if (campaignsResult.error) throw new Error(`university_distillation_campaign_health_read_failed:${String(campaignsResult.error.message || 'unknown').slice(0, 180)}`)
  const campaigns = (campaignsResult.data || []) as CampaignRow[]
  if (receiptResult.error) throw new Error(`university_distillation_heartbeat_read_failed:${String(receiptResult.error.message || 'unknown').slice(0, 180)}`)
  if (progressReceiptsResult.error) throw new Error(`university_distillation_progress_receipts_read_failed:${String(progressReceiptsResult.error.message || 'unknown').slice(0, 180)}`)
  if (policyResult.error) throw new Error(`university_distillation_rolling_policy_read_failed:${String(policyResult.error.message || 'unknown').slice(0, 180)}`)
  if (windowResult.error) throw new Error(`university_distillation_rolling_window_read_failed:${String(windowResult.error.message || 'unknown').slice(0, 180)}`)
  if (preparedResult.error) throw new Error(`university_distillation_prepared_queue_read_failed:${String(preparedResult.error.message || 'unknown').slice(0, 180)}`)
  if (providerResult.error) throw new Error(`university_distillation_provider_health_read_failed:${String(providerResult.error.message || 'unknown').slice(0, 180)}`)

  const preparedKeys = (preparedResult.data || []).map((row: any) => String(row.batch_key || '')).filter(Boolean)
  let consumedPreparedKeys = new Set<string>()
  if (preparedKeys.length > 0) {
    const consumedResult = await input.db.from('cos_university_mass_distillation_batch_runs')
      .select('batch_key')
      .in('batch_key', preparedKeys)
      .limit(100)
    if (consumedResult.error) throw new Error(`university_distillation_prepared_queue_qualification_failed:${String(consumedResult.error.message || 'unknown').slice(0, 180)}`)
    consumedPreparedKeys = new Set((consumedResult.data || []).map((row: any) => String(row.batch_key || '')).filter(Boolean))
  }
  const preparedBatches = preparedKeys.filter(key => !consumedPreparedKeys.has(key)).length
  const policy = policyResult.data as { enabled?: unknown; max_authorized_cost_usd?: unknown } | null
  const rollingCeilingRemoved = policy?.enabled === true && policy?.max_authorized_cost_usd == null
  const windowCampaigns = (windowResult.data || []) as Array<{ authorized_at?: unknown; max_total_cost_usd?: unknown }>
  const rollingAuthorizedCostUsd = windowCampaigns.reduce((sum, row) => sum + finite(row.max_total_cost_usd), 0)
  const nextBudgetReleaseAt = windowCampaigns
    .map(row => Date.parse(String(row.authorized_at || '')))
    .filter(Number.isFinite)
    .map(time => time + 24 * 60 * 60_000)
    .sort((a, b) => a - b)[0]

  let workflowRuns: WorkflowRunRow[] = []
  const providerJobs = (providerResult.data || []) as ProviderJobRow[]
  const campaignIds = campaigns.map(campaign => campaign.id)
  if (campaignIds.length > 0) {
    const runsResult = await input.db.from('cos_university_mass_distillation_batch_runs')
      .select('id,campaign_id,stage,updated_at,failure_reason')
      .in('campaign_id', campaignIds)
      .order('updated_at', { ascending: true })
      .limit(500)
    if (runsResult.error) throw new Error(`university_distillation_run_health_read_failed:${String(runsResult.error.message || 'unknown').slice(0, 180)}`)
    workflowRuns = (runsResult.data || []) as WorkflowRunRow[]
  }

  const curriculumProgress = deriveCurriculumPackagingProgress((progressReceiptsResult.data || []) as ReceiptRow[])

  return evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds,
    campaigns,
    receipt: (receiptResult.data || null) as ReceiptRow | null,
    workflowRuns,
    providerJobs,
    curriculumProgress,
    continuity: {
      preparedBatches,
      rollingPolicyEnabled: policy?.enabled === true,
      rollingMaximumAuthorizedCostUsd: rollingCeilingRemoved ? null : finite(policy?.max_authorized_cost_usd),
      rollingAuthorizedCostUsd,
      nextBudgetReleaseAt: rollingCeilingRemoved
        ? null
        : (Number.isFinite(nextBudgetReleaseAt) ? new Date(nextBudgetReleaseAt).toISOString() : null),
    },
  })
}

async function recordHealthSample(db: any, snapshot: UniversityDistillationHealthSnapshot, latencyMs: number): Promise<void> {
  const status = snapshot.state === 'healthy' ? 'healthy' : 'warning'
  const { error } = await db.from('self_healing_native_probe_samples').insert({
    probe_id: 'database',
    target: UNIVERSITY_DISTILLATION_MONITOR_TARGET,
    observed_at: snapshot.checkedAt,
    status,
    latency_ms: latencyMs,
    error_rate: snapshot.state === 'healthy' ? 0 : 1,
    metric_value: snapshot.receiptAgeSeconds,
    metric_unit: 'heartbeat_age_seconds',
    details: {
      probeKind: 'cos_university_mass_distillation_closed_loop',
      state: snapshot.state,
      reasons: snapshot.reasons,
      activeCampaigns: snapshot.activeCampaigns,
      failedCampaigns: snapshot.failedCampaigns,
      workflowRuns: snapshot.workflowRuns,
      claimableRuns: snapshot.claimableRuns,
      stalledDispatchRuns: snapshot.stalledDispatchRuns,
      workflowProgressAgeSeconds: snapshot.workflowProgressAgeSeconds,
      failedRuns: snapshot.failedRuns,
      staleFailedRuns: snapshot.staleFailedRuns,
      unsettledProviderJobs: snapshot.unsettledProviderJobs,
      overdueProviderJobs: snapshot.overdueProviderJobs,
      preparedBatches: snapshot.preparedBatches,
      curriculumPackagingStalled: snapshot.curriculumPackagingStalled,
      curriculumProgressObservedAt: snapshot.curriculumProgressObservedAt,
      curriculumProgressSubject: snapshot.curriculumProgressSubject,
      curriculumProgressShortfallToBatch: snapshot.curriculumProgressShortfallToBatch,
      curriculumProgressInsertedForSubject: snapshot.curriculumProgressInsertedForSubject,
      curriculumProgressPreparedBefore: snapshot.curriculumProgressPreparedBefore,
      curriculumProgressPreparedAfter: snapshot.curriculumProgressPreparedAfter,
      rollingPolicyEnabled: snapshot.rollingPolicyEnabled,
      rollingMaximumAuthorizedCostUsd: snapshot.rollingMaximumAuthorizedCostUsd,
      rollingCeilingRemoved: snapshot.rollingCeilingRemoved,
      rollingAuthorizedCostUsd: snapshot.rollingAuthorizedCostUsd,
      rollingRemainingAuthorizedCostUsd: snapshot.rollingRemainingAuthorizedCostUsd,
      nextBudgetReleaseAt: snapshot.nextBudgetReleaseAt,
      latestReceiptAt: snapshot.latestReceiptAt,
      latestInvocationSucceeded: snapshot.latestInvocationSucceeded,
      automaticRecoveryAuthorized: snapshot.automaticRecoveryAuthorized,
      authorityExpanded: false,
    },
  })
  if (error) throw new Error(`university_distillation_monitor_sample_save_failed:${String(error.message || 'unknown').slice(0, 180)}`)
}

export function buildUniversityMassDistillationIncident(snapshot: UniversityDistillationHealthSnapshot): SupervisorIncident {
  const fingerprint = createHash('sha256').update(JSON.stringify({
    campaigns: snapshot.activeCampaignIds,
    reasons: snapshot.reasons,
    receipt: snapshot.latestReceiptAt,
    preparedBatches: snapshot.preparedBatches,
    curriculumProgressObservedAt: snapshot.curriculumProgressObservedAt,
    rollingAuthorizedCostUsd: snapshot.rollingAuthorizedCostUsd,
  })).digest('hex').slice(0, 20)
  const critical = snapshot.reasons.some(reason => [
    'heartbeat_missing', 'heartbeat_stale', 'workflow_failed', 'campaign_failed',
    'claimable_stage_stalled', 'dispatch_claim_stalled', 'provider_job_overdue',
    'curriculum_packaging_stalled',
  ].includes(reason))
  return incidentSchema.parse({
    incidentId: `cos-university-distillation-${fingerprint}-${Math.floor(Date.parse(snapshot.checkedAt) / 300_000)}`,
    provider: 'signalboost-cos-university',
    environment: 'production',
    severity: critical ? 'critical' : 'warning',
    detectedAt: snapshot.checkedAt,
    source: 'cron',
    errorCode: UNIVERSITY_DISTILLATION_HEALTH_ERROR_CODE,
    errorMessage: `COS University mass distillation requires recovery: ${snapshot.reasons.join(', ')}.`,
    affectedResource: COS_UNIVERSITY_MASS_DISTILLATION_CRON_PATH,
    evidence: [
      {
        evidenceId: `${fingerprint}:heartbeat`, type: 'university_distillation_heartbeat', capturedAt: snapshot.checkedAt,
        summary: snapshot.latestReceiptAt
          ? `Latest Production receipt is ${snapshot.receiptAgeSeconds ?? 'unknown'} seconds old and invocationSucceeded=${String(snapshot.latestInvocationSucceeded)}.`
          : 'No Production receipt exists for the mass-distillation control loop.',
        reference: 'db://cos_university_learning_assurance_events/mass_distillation_campaign',
      },
      {
        evidenceId: `${fingerprint}:campaign`, type: 'university_distillation_campaign_authority', capturedAt: snapshot.checkedAt,
        summary: `${snapshot.activeCampaigns} live authorized campaign(s), including ${snapshot.failedCampaigns} failed campaign(s); $${snapshot.committedCostUsd.toFixed(6)} committed of $${snapshot.authorizedCostUsd.toFixed(6)} authorized.`,
        reference: 'db://cos_university_mass_distillation_campaigns',
      },
      {
        evidenceId: `${fingerprint}:workflow`, type: 'university_distillation_workflow_state', capturedAt: snapshot.checkedAt,
        summary: `${snapshot.claimableRuns} claimable run(s); ${snapshot.stalledDispatchRuns} stalled dispatch claim(s); ${snapshot.staleFailedRuns} stale failed run(s); ${snapshot.overdueProviderJobs} overdue unsettled provider job(s).`,
        reference: COS_UNIVERSITY_MASS_DISTILLATION_CRON_PATH,
      },
      ...(snapshot.curriculumPackagingStalled ? [{
        evidenceId: `${fingerprint}:packaging`, type: 'university_distillation_packaging_progress', capturedAt: snapshot.checkedAt,
        summary: `Packaging progress invariant failed for ${snapshot.curriculumProgressSubject || 'unknown subject'}: recorded shortfall ${snapshot.curriculumProgressShortfallToBatch}, same-subject inserted ${snapshot.curriculumProgressInsertedForSubject}, prepared before ${snapshot.curriculumProgressPreparedBefore}, prepared after ${snapshot.curriculumProgressPreparedAfter}.`,
        reference: 'db://cos_university_learning_assurance_events/mass_distillation_campaign',
      }] : []),
      {
        evidenceId: `${fingerprint}:continuity`, type: 'university_distillation_rolling_authority', capturedAt: snapshot.checkedAt,
        summary: snapshot.rollingCeilingRemoved
          ? `${snapshot.preparedBatches} unconsumed prepared batch(es); rolling policy enabled=${String(snapshot.rollingPolicyEnabled)}; rolling ceiling removed; $${snapshot.rollingAuthorizedCostUsd.toFixed(6)} authorized in the last 24 hours.`
          : `${snapshot.preparedBatches} unconsumed prepared batch(es); rolling policy enabled=${String(snapshot.rollingPolicyEnabled)}; $${snapshot.rollingAuthorizedCostUsd.toFixed(6)} of $${(snapshot.rollingMaximumAuthorizedCostUsd ?? 0).toFixed(6)} maximum authority used in the last 24 hours.`,
        reference: 'db://cos_university_mass_distillation_rolling_policy/owner-rolling-24h-v1',
      },
    ],
    metadata: {
      monitoringMode: 'native', observationOnly: true, nativeProbe: 'cos-university-mass-distillation',
      healthReasons: snapshot.reasons, activeCampaigns: snapshot.activeCampaigns,
      failedCampaigns: snapshot.failedCampaigns,
      latestReceiptAt: snapshot.latestReceiptAt, receiptAgeSeconds: snapshot.receiptAgeSeconds,
      expectedIntervalSeconds: snapshot.expectedIntervalSeconds,
      maximumHeartbeatAgeSeconds: snapshot.maximumHeartbeatAgeSeconds,
      workflowRuns: snapshot.workflowRuns, claimableRuns: snapshot.claimableRuns,
      stalledDispatchRuns: snapshot.stalledDispatchRuns,
      workflowProgressAgeSeconds: snapshot.workflowProgressAgeSeconds,
      failedRuns: snapshot.failedRuns, staleFailedRuns: snapshot.staleFailedRuns,
      unsettledProviderJobs: snapshot.unsettledProviderJobs, overdueProviderJobs: snapshot.overdueProviderJobs,
      authorizedCostUsd: snapshot.authorizedCostUsd, committedCostUsd: snapshot.committedCostUsd,
      remainingAuthorizedCostUsd: snapshot.remainingAuthorizedCostUsd,
      preparedBatches: snapshot.preparedBatches,
      curriculumPackagingStalled: snapshot.curriculumPackagingStalled,
      curriculumProgressObservedAt: snapshot.curriculumProgressObservedAt,
      curriculumProgressSubject: snapshot.curriculumProgressSubject,
      curriculumProgressShortfallToBatch: snapshot.curriculumProgressShortfallToBatch,
      curriculumProgressInsertedForSubject: snapshot.curriculumProgressInsertedForSubject,
      curriculumProgressPreparedBefore: snapshot.curriculumProgressPreparedBefore,
      curriculumProgressPreparedAfter: snapshot.curriculumProgressPreparedAfter,
      rollingPolicyEnabled: snapshot.rollingPolicyEnabled,
      rollingMaximumAuthorizedCostUsd: snapshot.rollingMaximumAuthorizedCostUsd,
      rollingCeilingRemoved: snapshot.rollingCeilingRemoved,
      rollingAuthorizedCostUsd: snapshot.rollingAuthorizedCostUsd,
      rollingRemainingAuthorizedCostUsd: snapshot.rollingRemainingAuthorizedCostUsd,
      nextBudgetReleaseAt: snapshot.nextBudgetReleaseAt,
      registeredRecoveryAction: UNIVERSITY_DISTILLATION_RECOVERY_TARGET,
      recoveryPreauthorized: snapshot.automaticRecoveryAuthorized,
      retryScope: snapshot.activeCampaigns > 0
        ? 'same_campaign_expiration_and_remaining_budget'
        : snapshot.rollingCeilingRemoved
          ? 'one_prepared_batch_within_owner_uncapped_policy'
          : 'one_prepared_batch_within_owner_rolling_24h_maximum_authority',
      automaticPromotionAuthorized: false,
      runpodMutationAuthorized: false, authorityExpanded: false,
    },
  })
}

export class UniversityMassDistillationObserver implements Observer {
  private readonly input: { db: any; now?: () => Date }

  constructor(input: { db: any; now?: () => Date }) {
    this.input = input
  }

  async observe(_context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const started = performance.now()
    const snapshot = await readUniversityMassDistillationHealth({ db: this.input.db, now: this.input.now?.() })
    await recordHealthSample(this.input.db, snapshot, Math.round(performance.now() - started))
    return snapshot.state === 'repair_required' ? [buildUniversityMassDistillationIncident(snapshot)] : []
  }
}

export function universityMassDistillationMonitoringCollector(input: {
  db: any
  now?: () => Date
}): NativeMonitoringCollector {
  return {
    id: 'cos-university-mass-distillation',
    signals: ['scheduled-job-health', 'queue-health', 'provider-health'],
    observer: new UniversityMassDistillationObserver(input),
  }
}
