import { NextResponse } from 'next/server'
import { BUILDER_JOB_STALE_AFTER_MS, listBuilderContinuations, personStartedFirst } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { getAdminSupabase } from '@/utils/supabase/server'
import { retryFailedOwnedAuditEngineRepair } from '@/self-healing-host/owned-audit-self-healing'
import { retryFailedUniversityDistillationRepair } from '@/self-healing-host/university-distillation-autonomous-repair'
import { reconcileBuilderCompetencyGaps } from '@/lib/builder/competency-gap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type OwnedRepairKind = 'site' | 'audit' | 'university' | 'production-recovery' | 'playwright-cli-canary'
type QueuedOwnedRepair = { id: string; userId: string; kind: OwnedRepairKind; createdAt: string }

async function queuedOwnedRepair(
  metadataKey: 'selfHealingOwnedSite' | 'selfHealingOwnedAudit' | 'selfHealingUniversityDistillation' | 'selfHealingProductionRecovery' | 'builderPlaywrightCliCanary',
  kind: OwnedRepairKind,
): Promise<QueuedOwnedRepair | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('builder_jobs').select('id,user_id,created_at')
    .eq('status', 'queued')
    .eq('job_kind', 'standard')
    .eq('owner_authorized', true)
    .contains('metadata', { [metadataKey]: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[builder_self_healing_queue_read_failed]', { kind, message: error.message })
    return null
  }
  return data?.id && data?.user_id
    ? { id: String(data.id), userId: String(data.user_id), kind, createdAt: String(data.created_at || '') }
    : null
}

// Only retry a previously deferred standard job, never an arbitrary queued POST.
// A cooldown avoids repeatedly contending for the same busy RunPod slot.
export function builderCapacityRetryDelayMs(deferrals: number): number {
  // Persisted deferral count and updated_at form a durable backoff clock. Never spin
  // within a single cron invocation when the only model is unavailable.
  const attempts = Math.max(1, Math.min(8, Math.floor(Number(deferrals) || 1)))
  return Math.min(15 * 60_000, 30_000 * 2 ** (attempts - 1))
}

// Only retry a previously deferred standard job after its durable backoff expires.
// Selection is read-only; claim_builder_job_slice remains the concurrency fence.
async function queuedCapacityRecovery(): Promise<{ id: string; userId: string } | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('builder_jobs')
    .select('id,user_id,updated_at,metadata')
    .eq('status', 'queued').eq('job_kind', 'standard')
    .not('metadata->>builderCapacityDeferredReason', 'is', null)
    .order('updated_at', { ascending: true }).limit(30)
  if (error) {
    console.warn('[builder_capacity_queue_read_failed]', { message: error.message })
    return null
  }
  const now = Date.now()
  // A person's build goes before background Self-Healing work in the same cooled-down queue.
  const due = personStartedFirst(data || []).find(job => {
    const deferredAt = Date.parse(String(job.updated_at || ''))
    const attempts = Number(job.metadata?.builderCapacityDeferrals || 1)
    return Number.isFinite(deferredAt) && now - deferredAt >= builderCapacityRetryDelayMs(attempts)
  })
  return due?.id && due?.user_id ? { id: String(due.id), userId: String(due.user_id) } : null
}

// Reconcile queued customer work whose initial after() worker never claimed it.
// Only dispatch preexisting server-stored jobs; never reconstruct or replay a POST.
// Wait at least six minutes to avoid racing healthy initial dispatches.
async function queuedUnclaimedBuilderJob(): Promise<{ id: string; userId: string } | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('builder_jobs')
    .select('id,user_id')
    .eq('status', 'queued').eq('job_kind', 'standard')
    .eq('claim_generation', 0)
    .lt('created_at', new Date(Date.now() - 6 * 60_000).toISOString())
    .order('created_at', { ascending: true }).limit(1)
  if (error) {
    console.error('[builder_unclaimed_queue_read_failed]', { code: error.code })
    return null
  }
  const job = data?.[0]
  return job?.id && job?.user_id ? { id: String(job.id), userId: String(job.user_id) } : null
}

async function queuedOwnedSelfHealingRepairs(): Promise<QueuedOwnedRepair[]> {
  const [productionRecovery, site, audit, university] = await Promise.all([
    queuedOwnedRepair('selfHealingProductionRecovery', 'production-recovery'),
    queuedOwnedRepair('selfHealingOwnedSite', 'site'),
    queuedOwnedRepair('selfHealingOwnedAudit', 'audit'),
    queuedOwnedRepair('selfHealingUniversityDistillation', 'university'),
  ])
  // A rolled-back Production regression is the most urgent owned recovery lane.
  return [productionRecovery, site, audit, university].filter((job): job is QueuedOwnedRepair => Boolean(job))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Original authenticated jobs supply identity and objective. No request-supplied work is accepted.
  // Preserve the established Builder continuation contract first; the production gate verifies that
  // authentication completes before this explicit continuation read. Owned Self-Healing recovery lanes
  // are then evaluated separately so they cannot weaken or obscure the normal continuation path.
  // Reconcile expired claims before selecting checkpointed jobs. Fenced recovery cannot
  // replay POST or allow a delayed worker to commit under its expired generation.
  const db = getAdminSupabase()
  const { error: staleRecoveryError } = await db.rpc('requeue_stale_builder_claims', {
    p_cutoff: new Date(Date.now() - BUILDER_JOB_STALE_AFTER_MS).toISOString(),
  })
  if (staleRecoveryError) {
    console.error('[builder_stale_claim_requeue_failed]', { code: staleRecoveryError.code })
    return NextResponse.json({ ok: false, error: 'builder_stale_claim_recovery_unavailable' }, { status: 503 })
  }
  // Recover non-checkpointed claims only. A checkpointed claim must never be
  // terminalized by this generic expiry route: the fenced requeue owns recovery. The existing scoped RPC terminally fences the rest.
  // A live heartbeat prevents declaring an actively executing tool round stale.
  const cutoff = new Date(Date.now() - BUILDER_JOB_STALE_AFTER_MS).toISOString()
  const { data: stranded, error: strandedError } = await db.from('builder_jobs')
    .select('id,user_id,last_heartbeat_at,updated_at,checkpoint,job_kind,claim_generation,metadata')
    .eq('status', 'running').lt('updated_at', cutoff).limit(100)
  if (strandedError) {
    console.error('[builder_stale_claim_scan_failed]', { code: strandedError.code })
    return NextResponse.json({ ok: false, error: 'builder_stale_claim_scan_unavailable' }, { status: 503 })
  }
  for (const stuck of stranded || []) {
    if (stuck.last_heartbeat_at && Date.parse(stuck.last_heartbeat_at) > Date.parse(cutoff)) continue
    // The requeue RPC exclusively owns recoverable checkpoints; however,
    // exhausted checkpoint claims can no longer requeue and must reach expiry.
    const attempts = Number(stuck.metadata?.builderStaleRequeues || 0)
    const recoverable = stuck.checkpoint !== null
      && stuck.job_kind === 'standard'
      && stuck.claim_generation < 24
      && attempts < 3
    if (recoverable) continue
    const { error } = await db.rpc('expire_stale_builder_jobs', {
      p_user_id: stuck.user_id, p_job_id: stuck.id,
      p_conversation_id: null, p_cutoff: cutoff,
    })
    if (error) {
      console.error('[builder_stale_claim_expire_failed]', { jobId: stuck.id, code: error.code })
      return NextResponse.json({ ok: false, error: 'builder_stale_claim_expire_unavailable' }, { status: 503 })
    }
  }
  const continuations = await listBuilderContinuations()
  // Reconciliation visibility: the scheduler deliberately executes only one job per
  // tick. Report the remaining durable backlog rather than implying a quiet tick
  // means all approved work has completed.
  const { count: pendingContinuationCount, error: backlogError } = await db
    .from('builder_jobs').select('id', { count: 'exact', head: true })
    .eq('status', 'paused').eq('job_kind', 'standard')
    .not('checkpoint', 'is', null)
  if (backlogError) console.warn('[builder.continuation.backlog_read_failed]', { code: backlogError.code })
  else if ((pendingContinuationCount ?? 0) > 0) console.info('[builder.continuation.backlog]', {
    pending: pendingContinuationCount,
    selectedCandidates: continuations.length,
    // Some checkpointed jobs may be exhausted or waiting on a customer decision.
    // Never claim they are runnable just because the checkpoint exists.
  })
  const competencyReconciliation = await reconcileBuilderCompetencyGaps({ lookbackHours: 72, limit: 50 })
    .catch(error => {
      console.warn('[builder_competency_gap_reconciliation_failed]', {
        message: error instanceof Error ? error.message : 'unknown',
      })
      return { scanned: 0, filed: 0 }
    })
  const admin = getAdminSupabase()
  // A heartbeat is progress telemetry, not a lease renewal. The existing stale
  // recovery contract stays authoritative; this signal is for operators.
  const heartbeatCutoff = new Date(Date.now() - 120_000).toISOString()
  const { data: overdueJobs, error: heartbeatScanError } = await admin.from('builder_jobs')
    .select('id,user_id,claim_generation,last_heartbeat_at,started_at')
    .eq('status', 'running')
    .lt('last_heartbeat_at', heartbeatCutoff)
    .limit(20)
  if (heartbeatScanError) console.warn('[builder_heartbeat_scan_failed]', { code: heartbeatScanError.code })
  for (const overdue of overdueJobs || []) {
    console.error('[builder.continuation.heartbeat_overdue]', {
      jobId: overdue.id, userId: overdue.user_id,
      claimGeneration: overdue.claim_generation,
      lastHeartbeatAt: overdue.last_heartbeat_at,
      thresholdSeconds: 120,
    })
  }
  const [auditRetry, universityRetry] = await Promise.all([
    retryFailedOwnedAuditEngineRepair(admin),
    retryFailedUniversityDistillationRepair(admin),
  ])
  const [ownedRepairs, playwrightCliCanary, capacityRecovery, unclaimedRecovery] = await Promise.all([
    queuedOwnedSelfHealingRepairs(),
    queuedOwnedRepair('builderPlaywrightCliCanary', 'playwright-cli-canary'),
    queuedCapacityRecovery(),
    queuedUnclaimedBuilderJob(),
  ])
  const unique = new Map<string, { id: string; userId: string }>()
  // Preserve paused Builder continuations first. A deliberately queued owner acceptance canary is
  // next so a large Self-Healing backlog cannot starve explicit production proof indefinitely.
  // The canary consumes at most one scheduler tick; no repair job is removed or reclassified.
  for (const job of [...continuations, ...(playwrightCliCanary ? [playwrightCliCanary] : []), ...(capacityRecovery ? [capacityRecovery] : []), ...(unclaimedRecovery ? [unclaimedRecovery] : []), ...ownedRepairs]) {
    unique.set(job.id, { id: job.id, userId: job.userId })
  }
  const jobs = [...unique.values()]

  // A single RunPod reasoner serves Builder. Running several continuations in Promise.all overloaded
  // that one GPU, pushed healthy requests past the 120s timeout, and converted queueing into paid
  // DeepInfra fallback. Execute one durable continuation per scheduler tick; later jobs remain queued.
  // Admission gate across invocations: a scheduler tick must not start another
  // RunPod-bound job while an unexpired durable worker claim remains running.
  // Fail closed on database errors rather than treating an unknown count as idle.
  const { count: activeRunningClaims, error: activeClaimsError } = await admin
    .from('builder_jobs').select('id', { count: 'exact', head: true })
    .eq('status', 'running').eq('job_kind', 'standard')
  if (activeClaimsError) {
    console.error('[builder.continuation.admission_read_failed]', { code: activeClaimsError.code })
    return NextResponse.json({ ok: false, error: 'builder_continuation_admission_unavailable' }, { status: 503 })
  }
  const blockedByActiveClaim = (activeRunningClaims ?? 0) > 0
  if (blockedByActiveClaim && jobs.length) console.info('[builder.continuation.admission_deferred]', {
    activeRunningClaims, pendingCandidates: jobs.length,
  })
  // Existing generation-fenced claims remain authoritative. This admission check
  // reduces overlap but is not an atomic global lease; concurrent ticks can race.
  const selected = blockedByActiveClaim ? null : jobs[0] || null
  let execution: { jobId: string; status: string; durationMs: number; errorCode: string | null } | null = null
  if (selected) {
    const startedAt = Date.now()
    const context = { jobId: selected.id, userId: selected.userId, candidates: jobs.length }
    // Emit structured lifecycle records without changing the atomic claim or queue ordering.
    console.info('[builder.continuation.selected]', context)
    console.info('[builder.continuation.started]', { ...context, startedAt: new Date(startedAt).toISOString() })
    try {
      await runBuilderJob(selected.id, selected.userId)
      // A worker may pause/requeue or finish; returning from runBuilderJob does not imply success.
      const { data, error } = await admin.from('builder_jobs')
        .select('status,error,claim_generation,updated_at')
        .eq('id', selected.id).eq('user_id', selected.userId).maybeSingle()
      if (error) throw new Error('builder_continuation_status_read_failed')
      const status = String(data?.status || 'unknown')
      const errorCode = typeof data?.error === 'string' ? data.error.slice(0, 160) : null
      execution = { jobId: selected.id, status, durationMs: Date.now() - startedAt, errorCode }
      const details = { ...context, ...execution, claimGeneration: data?.claim_generation, updatedAt: data?.updated_at }
      if (status === 'failed') console.error('[builder.continuation.failed]', details)
      else console.info('[builder.continuation.completed]', details)
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 160) : 'unknown'
      console.error('[builder.continuation.failed]', {
        ...context, durationMs: Date.now() - startedAt, errorCode,
      })
      // Surface an unsuccessful scheduler tick so monitoring can alert; never mark the job
      // failed here because its durable status is owned by the fenced job lifecycle.
      return NextResponse.json({ ok: false, error: 'builder_continuation_execution_failed',
        selectedJobId: selected.id, durationMs: Date.now() - startedAt }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: jobs.length,
    pendingCheckpointedJobs: backlogError ? null : pendingContinuationCount,
    activeRunningClaims,
    admissionDeferred: blockedByActiveClaim && jobs.length > 0,
    competencyFailuresScanned: competencyReconciliation.scanned,
    overdueRunningJobs: overdueJobs?.length || 0,
    competencyGapsFiled: competencyReconciliation.filed,
    executed: selected ? 1 : 0,
    selectedJob: execution,
    deferred: Math.max(0, jobs.length - (selected ? 1 : 0)),
    productionRecoveryQueued: ownedRepairs.some(job => job.kind === 'production-recovery'),
    ownedSiteRepairQueued: ownedRepairs.some(job => job.kind === 'site'),
    ownedAuditRepairQueued: ownedRepairs.some(job => job.kind === 'audit'),
    universityDistillationRepairQueued: ownedRepairs.some(job => job.kind === 'university'),
    playwrightCliCanaryQueued: playwrightCliCanary !== null,
    unclaimedRecoveryQueued: unclaimedRecovery !== null,
    ownedAuditRepairRetried: auditRetry.retried,
    ownedAuditRepairRetryAttempt: auditRetry.attempt,
    universityDistillationRepairRetried: universityRetry.retried,
    universityDistillationRepairRetryAttempt: universityRetry.attempt,
  })
}
