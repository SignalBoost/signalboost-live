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

export type UniversityDistillationHealthReason =
  | 'heartbeat_missing'
  | 'heartbeat_stale'
  | 'workflow_failed'
  | 'campaign_failed'
  | 'claimable_stage_stalled'
  | 'dispatch_claim_stalled'
  | 'failed_stage_recovery_stalled'
  | 'provider_job_overdue'

export interface UniversityDistillationHealthSnapshot {
  checkedAt: string
  state: 'idle' | 'healthy' | 'repair_required'
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

export function evaluateUniversityMassDistillationHealth(input: {
  now: Date
  expectedIntervalSeconds: number
  campaigns: readonly CampaignRow[]
  receipt: ReceiptRow | null
  workflowRuns: readonly WorkflowRunRow[]
  providerJobs: readonly ProviderJobRow[]
}): UniversityDistillationHealthSnapshot {
  const nowMs = input.now.getTime()
  const expectedIntervalSeconds = Math.max(60, Math.min(3600, Math.floor(input.expectedIntervalSeconds)))
  const maximumHeartbeatAgeSeconds = Math.max(15 * 60, expectedIntervalSeconds * 3)
  const failedRunGraceSeconds = Math.max(20 * 60, expectedIntervalSeconds * 4)
  const campaignIds = unique(input.campaigns.map(campaign => String(campaign.id)).filter(Boolean))
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

  if (campaignIds.length === 0) {
    return {
      checkedAt: input.now.toISOString(), state: 'idle', reasons: [], expectedIntervalSeconds,
      maximumHeartbeatAgeSeconds, activeCampaigns: 0, failedCampaigns: 0, activeCampaignIds: [], latestReceiptAt: input.receipt?.observed_at ?? null,
      latestCommitSha: input.receipt?.commit_sha ?? null, latestInvocationSucceeded: invocationSucceeded,
      receiptAgeSeconds, workflowRuns: 0, claimableRuns: 0, stalledDispatchRuns: 0,
      workflowProgressAgeSeconds: null, failedRuns: 0, staleFailedRuns: 0,
      unsettledProviderJobs: 0, overdueProviderJobs: 0,
      authorizedCostUsd: 0, committedCostUsd: 0, remainingAuthorizedCostUsd: 0,
      automaticRecoveryAuthorized: false, automaticPromotionAuthorized: false, runpodMutationAuthorized: false,
      authorityExpanded: false,
    }
  }

  const reasons: UniversityDistillationHealthReason[] = []
  if (!input.receipt) reasons.push('heartbeat_missing')
  else if (receiptAgeSeconds == null || receiptAgeSeconds > maximumHeartbeatAgeSeconds) reasons.push('heartbeat_stale')
  if (invocationSucceeded === false) reasons.push('workflow_failed')
  if (failedCampaigns.length > 0) reasons.push('campaign_failed')
  if (claimableRuns.length > 0 && input.providerJobs.length === 0
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
  const expectedIntervalSeconds = cadence?.maximumIntervalSeconds ?? 5 * 60
  const campaignsResult = await input.db.from('cos_university_mass_distillation_campaigns')
    .select('id,status,authorized_at,expires_at,max_total_cost_usd,committed_cost_usd')
    .in('status', ['authorized', 'active', 'failed'])
    .gt('expires_at', now.toISOString())
    .order('authorized_at', { ascending: true })
    .limit(100)
  if (campaignsResult.error) throw new Error(`university_distillation_campaign_health_read_failed:${String(campaignsResult.error.message || 'unknown').slice(0, 180)}`)
  const campaigns = (campaignsResult.data || []) as CampaignRow[]
  const receiptResult = await input.db.from('cos_university_learning_assurance_events')
    .select('observed_at,commit_sha,evidence')
    .eq('event_type', 'production_path')
    .eq('path_id', 'mass_distillation_campaign')
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (receiptResult.error) throw new Error(`university_distillation_heartbeat_read_failed:${String(receiptResult.error.message || 'unknown').slice(0, 180)}`)

  let workflowRuns: WorkflowRunRow[] = []
  let providerJobs: ProviderJobRow[] = []
  const campaignIds = campaigns.map(campaign => campaign.id)
  if (campaignIds.length > 0) {
    const [runsResult, providerResult] = await Promise.all([
      input.db.from('cos_university_mass_distillation_batch_runs')
        .select('id,campaign_id,stage,updated_at,failure_reason')
        .in('campaign_id', campaignIds)
        .order('updated_at', { ascending: true })
        .limit(500),
      input.db.from('cos_university_mass_distillation_provider_jobs')
        .select('campaign_id,operation,dispatched_at,timeout_seconds,provider_stage')
        .in('campaign_id', campaignIds)
        .is('settled_at', null)
        .order('dispatched_at', { ascending: true })
        .limit(200),
    ])
    if (runsResult.error) throw new Error(`university_distillation_run_health_read_failed:${String(runsResult.error.message || 'unknown').slice(0, 180)}`)
    if (providerResult.error) throw new Error(`university_distillation_provider_health_read_failed:${String(providerResult.error.message || 'unknown').slice(0, 180)}`)
    workflowRuns = (runsResult.data || []) as WorkflowRunRow[]
    providerJobs = (providerResult.data || []) as ProviderJobRow[]
  }

  return evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds,
    campaigns,
    receipt: (receiptResult.data || null) as ReceiptRow | null,
    workflowRuns,
    providerJobs,
  })
}

async function recordHealthSample(db: any, snapshot: UniversityDistillationHealthSnapshot, latencyMs: number): Promise<void> {
  const status = snapshot.state === 'repair_required' ? 'warning' : 'healthy'
  const { error } = await db.from('self_healing_native_probe_samples').insert({
    probe_id: 'database',
    target: UNIVERSITY_DISTILLATION_MONITOR_TARGET,
    observed_at: snapshot.checkedAt,
    status,
    latency_ms: latencyMs,
    error_rate: snapshot.state === 'repair_required' ? 1 : 0,
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
  })).digest('hex').slice(0, 20)
  const critical = snapshot.reasons.some(reason => [
    'heartbeat_missing', 'heartbeat_stale', 'workflow_failed', 'campaign_failed',
    'claimable_stage_stalled', 'dispatch_claim_stalled', 'provider_job_overdue',
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
          : 'No Production receipt exists for the active mass-distillation campaign.',
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
      registeredRecoveryAction: UNIVERSITY_DISTILLATION_RECOVERY_TARGET,
      recoveryPreauthorized: snapshot.automaticRecoveryAuthorized,
      retryScope: 'same_campaign_expiration_and_remaining_budget', automaticPromotionAuthorized: false,
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
