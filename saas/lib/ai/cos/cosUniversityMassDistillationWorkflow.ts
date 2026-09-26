import { withHostProductionHarnessIngress } from '../../../platform-harness/runtime/host-ingress.ts'
// saas/lib/ai/cos/cosUniversityMassDistillationWorkflow.ts
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  massDistillationDispatchReadiness,
  recoverMassDistillationCampaigns,
  closeExpiredMassDistillationCampaigns,
  recoverStalledMassDistillationDispatchClaims,
  runMassDistillationCampaignConsumer,
} from './cosUniversityMassDistillationConsumer.ts'
import {
  MASS_DISTILLATION_MAX_BATCH,
  MASS_DISTILLATION_QUALITY_MIN_BATCH,
  MASS_DISTILLATION_STUDENT_MODEL,
  prepareUniversityMassDistillationCurriculum,
} from './cosUniversityMassDistillation.ts'
import { installVerifiedFailureDerivedCurriculum, maintainUniversityRightsClearedOpenSourceCorpus, replenishUniversityMassDistillationCurriculum } from './cosUniversityDistillationCurriculumReplenishment.ts'
import { massDistillationThroughputProfile } from './cosUniversityDistillationCurriculumPlan.ts'
import { authorizeAvailableUniversityMassDistillationCampaigns, authorizeNextUniversityMassDistillationRemediationCampaign } from './cosUniversityMassDistillationRollingAuthorization.ts'
import { diagnoseFailedMassDistillationHuggingFaceJobs, recoverHuggingFaceStorageCapacityCircuit } from './cosUniversityHuggingFaceJobDiagnostics.ts'
import { reconcileMassDistillationHuggingFaceProviderLedger } from './cosUniversityHuggingFaceProviderLedger.ts'
import { universityTeacherPoolStatus } from './cosUniversityTeacherPool.ts'
import { terminalizeFailedMassDistillationCampaignRuns } from './cosUniversityMassDistillationTerminalCleanup.ts'
import { reconcilePreparedMassDistillationSemanticCohesion } from './cosUniversityMassDistillationSemanticReconciliation.ts'
import {
  claimUniversityMassDistillationWorkflowLease,
  releaseUniversityMassDistillationWorkflowLease,
} from './cosUniversityMassDistillationWorkflowLease.ts'
import { readMassEvaluationBacklogGate } from './cosUniversityMassEvaluationBacklogGate.ts'

export type MassDistillationWorkflowSource = 'scheduled_cron' | 'self_healing_supervisor'

function safeError(error: unknown): string {
  if (error instanceof Error) return String(error.message || error.name || 'unknown_error').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (error && typeof error === 'object') {
    const raw = error as Record<string, unknown>
    const parts = [raw.code, raw.message, raw.details, raw.hint]
      .map(value => String(value ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (parts.length) return parts.join(' | ').slice(0, 500)
    try { return JSON.stringify(error).slice(0, 500) } catch {}
  }
  return String(error || 'unknown_error').replace(/\s+/g, ' ').trim().slice(0, 500)
}

async function isolatedStep<T extends Record<string, any>>(name: string, fn: () => Promise<T>): Promise<T | Record<string, any>> {
  try {
    return await fn()
  } catch (error) {
    const message = safeError(error)
    console.error('[cos-university-mass-distillation-step]', JSON.stringify({ ok: false, step: name, error: message }))
    return { ok: false, skipped: false, step: name, error: message }
  }
}

async function consumedBatchKeys(db: any, keys: readonly string[]): Promise<Set<string>> {
  const consumed = new Set<string>()
  const chunkSize = 200
  for (let offset = 0; offset < keys.length; offset += chunkSize) {
    const chunk = keys.slice(offset, offset + chunkSize)
    const result = await db.from('cos_university_mass_distillation_batch_runs')
      .select('batch_key')
      .in('batch_key', chunk)
    if (result.error) throw result.error
    for (const row of result.data || []) {
      const key = String((row as any).batch_key || '')
      if (key) consumed.add(key)
    }
  }
  return consumed
}

/** Count prepared batches until the buyer/owner configured inventory target is satisfied. */
async function preparedMassDistillationInventory(target: number): Promise<number> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const pageSize = 100
  let offset = 0
  let available = 0
  while (available < target) {
    const prepared = await db.from('cos_university_distillation_curriculum_batches')
      .select('batch_key')
      .eq('status', 'prepared')
      .eq('dispatch_authorized', false)
      .eq('authority_expanded', false)
      .eq('student_model_id', MASS_DISTILLATION_STUDENT_MODEL)
      .gte('source_count', MASS_DISTILLATION_QUALITY_MIN_BATCH)
      .lte('source_count', MASS_DISTILLATION_MAX_BATCH)
      .order('prepared_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (prepared.error) throw prepared.error
    const rows = prepared.data || []
    const keys = rows.map((row: any) => String(row.batch_key || '')).filter(Boolean)
    if (keys.length) {
      const used = await consumedBatchKeys(db, keys)
      available += keys.filter(key => !used.has(key)).length
    }
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return available
}

/**
 * One canonical distillation control loop shared by the scheduled worker and the Self-Healing
 * Supervisor. Terminal cleanup and dispatch-critical recovery run first, then already-authorized
 * provider work is dispatched before slower semantic/curriculum maintenance. Non-spending curriculum
 * preparation still maintains buyer/owner-configured ready inventory independently of paid authority.
 * Paid dispatch remains bounded by the University's separate owner-approved rolling policy.
 */
async function runOwnedCosUniversityMassDistillationWorkflow(input: {
  source: MassDistillationWorkflowSource
  now?: Date
}): Promise<{
  response: Record<string, unknown>
  invocationSucceeded: boolean
  transportSucceeded: boolean
  skipped: boolean
}> {
  const now = input.now || new Date()
  const throughput = massDistillationThroughputProfile()
  const teacherPool = universityTeacherPoolStatus()
  // Keep the critical dispatch/reconciliation loop live every minute, but do the expensive
  // campaign-recovery + semantic/curriculum maintenance sweep only every five minutes.
  // A Self-Healing Supervisor invocation bypasses the cadence so an incident repair never waits.
  const slowMaintenanceDue = input.source === 'self_healing_supervisor' || now.getUTCMinutes() % 5 === 0
  // Cleanup/closure is deliberately first and fail-isolated. A telemetry or provider-ledger error
  // must never strand an expired active campaign and block the next authorized campaign.
  const campaignClosure = await isolatedStep('campaign_closure', () =>
    closeExpiredMassDistillationCampaigns({ now, maxCampaigns: 10 }))
  const terminalCleanup = await isolatedStep('terminal_cleanup', () =>
    terminalizeFailedMassDistillationCampaignRuns({ maxCampaigns: 5 }))
  const reconciliation = await isolatedStep('provider_reconciliation', () =>
    reconcileMassDistillationHuggingFaceProviderLedger({ now, maxJobs: 5 }))
  const diagnostics = await isolatedStep('provider_diagnostics', () =>
    diagnoseFailedMassDistillationHuggingFaceJobs({ maxJobs: 3 }))
  // Deterministic Hugging Face storage exhaustion opens the provider circuit and correctly blocks
  // blind paid retries. Self-Healing may only half-open it after fresh read-only provider evidence
  // still classifies the condition as storage capacity, and that authority is one-shot: the consumer
  // atomically consumes it for exactly one paid verification dispatch.
  const providerStorageRecovery = await isolatedStep('provider_storage_recovery', () =>
    recoverHuggingFaceStorageCapacityCircuit({ maxJobs: 3, now }))
  const stalledDispatchRecovery = await isolatedStep('stalled_dispatch_recovery', () =>
    recoverStalledMassDistillationDispatchClaims({ now, maxRuns: 5 }))
  let recovery: Record<string, any> = slowMaintenanceDue
    ? await isolatedStep('campaign_recovery', () => recoverMassDistillationCampaigns({ now, maxCampaigns: 4 }))
    : { ok: true, skipped: true, step: 'campaign_recovery', reason: 'maintenance_not_due' }
  // Dispatch is the critical path. Do it before semantic/curriculum maintenance so an already
  // authorized prepared batch cannot be starved by slow reconciliation or replenishment work.
  let rollingAuthorization: Record<string, unknown>
  const dispatchReadiness = massDistillationDispatchReadiness()
  // New campaigns may start only while downstream canary/evaluation can keep up. The backlog gate
  // pauses NEW authorization, but it must not strand a campaign that already holds bounded authority:
  // an authorized teacher/preparation/training lifecycle may drain to its terminal artifact so partial
  // hosted-teacher work, provider reservations, and campaign capacity do not remain stuck forever.
  // No authority is widened here; the consumer can only claim existing authorized/active campaigns.
  const evaluationBacklog = await readMassEvaluationBacklogGate({ db: cosServiceDb() as any })
  const backlogPaused = dispatchReadiness.ready && !evaluationBacklog.open
  try {
    rollingAuthorization = backlogPaused
      ? {
          ...(await authorizeNextUniversityMassDistillationRemediationCampaign()),
          remediationOnly: true,
          generalCampaignAuthorizationPaused: true,
          pendingEvaluation: evaluationBacklog.pendingEvaluation,
          backlogLimit: evaluationBacklog.limit,
        }
      : dispatchReadiness.ready
      ? { ...(await authorizeAvailableUniversityMassDistillationCampaigns()) }
      : {
          ok: false,
          authorized: false,
          reason: dispatchReadiness.reason,
          automaticPromotionAuthorized: false,
          runpodMutationAuthorized: false,
          authorityExpanded: false,
        }
  } catch (error) {
    rollingAuthorization = {
      ok: false,
      authorized: false,
      reason: 'rolling_authorization_failed',
      error: safeError(error),
      automaticPromotionAuthorized: false,
      runpodMutationAuthorized: false,
      authorityExpanded: false,
    }
  }
  const initialResult: Record<string, any> = await runMassDistillationCampaignConsumer({ now, maxDispatches: 5 })
  const backlogDrainMode = backlogPaused && initialResult.ok === true
    ? {
        active: true,
        reason: evaluationBacklog.reason,
        pendingEvaluation: evaluationBacklog.pendingEvaluation,
        backlogLimit: evaluationBacklog.limit,
        newCampaignAuthorizationPaused: true,
        boundedRemediationCampaignException: rollingAuthorization.authorized === true,
        existingCampaignDrainAllowed: true,
        authorityExpanded: false,
      }
    : {
        active: false,
        newCampaignAuthorizationPaused: backlogPaused,
        existingCampaignDrainAllowed: true,
        authorityExpanded: false,
      }
  let result: Record<string, any> = initialResult
  let capacityRecovery: Record<string, any> = { ok: true, skipped: true, reason: 'capacity_recovery_not_needed' }
  let postRecoveryAuthorization: Record<string, any> = { ok: true, authorized: false, skipped: true, reason: 'capacity_recovery_not_needed' }
  let postRecoveryConsumer: Record<string, any> = { ok: true, skipped: true, reason: 'capacity_recovery_not_needed', dispatched: 0 }

  // A full topology with nothing claimable is not healthy utilization: stale/failed campaigns can
  // occupy every concurrency slot while prepared work waits. Repair this synchronously instead of
  // waiting for the five-minute maintenance cadence or a separate Supervisor observation.
  const capacityBlockedWithoutWork = dispatchReadiness.ready
    && rollingAuthorization.reason === 'dynamic_capacity_full'
    && ['no_authorized_campaign', 'no_claimable_campaign'].includes(String(initialResult.reason || ''))
  if (capacityBlockedWithoutWork) {
    capacityRecovery = await isolatedStep('capacity_recovery', () =>
      recoverMassDistillationCampaigns({ now, maxCampaigns: 4 }))
    if (capacityRecovery.ok === true) {
      try {
        postRecoveryAuthorization = { ...(await authorizeAvailableUniversityMassDistillationCampaigns()) }
      } catch (error) {
        postRecoveryAuthorization = {
          ok: false,
          authorized: false,
          reason: 'post_recovery_authorization_failed',
          error: safeError(error),
          automaticPromotionAuthorized: false,
          runpodMutationAuthorized: false,
          authorityExpanded: false,
        }
      }
      if (postRecoveryAuthorization.ok === true && postRecoveryAuthorization.authorized === true) {
        postRecoveryConsumer = await runMassDistillationCampaignConsumer({ now, maxDispatches: 5 })
        result = postRecoveryConsumer
      }
    }
  }

  const semanticReconciliation = slowMaintenanceDue
    ? await isolatedStep('semantic_reconciliation', () => reconcilePreparedMassDistillationSemanticCohesion({ maxBatches: 20 }))
    : { ok: true, skipped: true, step: 'semantic_reconciliation', reason: 'maintenance_not_due' }
  const preparedBufferTarget = throughput.preparedBatchBufferTarget
  let preparedBeforeReplenishment = 0
  let preparedAfterReplenishment = 0
  let curriculum: Record<string, unknown>
  let curriculumReplenishment: Record<string, unknown> = { ok: true, skipped: true, reason: 'prepared_buffer_satisfied', externalCostUsd: 0 }
  let openSourceMaintenance: Record<string, unknown> = { ok: true, skipped: true, reason: 'maintenance_not_due', externalCostUsd: 0 }
  if (slowMaintenanceDue) {
  try {
    curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now, {
      corpusScanRows: throughput.corpusScanRows,
      maxBatchesPerSweep: throughput.maxBatchesPerSweep,
    })) }
    preparedBeforeReplenishment = await preparedMassDistillationInventory(preparedBufferTarget)
    if (preparedBeforeReplenishment >= preparedBufferTarget) {
      // A full prepared-job buffer may stop paid/synthetic fill, but it must never stop learning from
      // free, rights-cleared sources. Run a small source-only harvest that cannot create hosted-teacher
      // spend or synthetic curriculum and cannot widen training/production authority.
      openSourceMaintenance = await isolatedStep('open_source_maintenance', () =>
        maintainUniversityRightsClearedOpenSourceCorpus({
          now,
          maxSubjects: throughput.targetSubjectsPerReplenishment,
          queriesPerSubject: 1,
          maxCandidatesPerCycle: Math.min(20, throughput.acquisitionCandidatesPerCycle),
        }))
      const failureDerived = await installVerifiedFailureDerivedCurriculum({
        db: cosServiceDb()!,
        supply: Array.isArray((curriculum.supply as { subjects?: unknown })?.subjects)
          ? (curriculum.supply as { subjects: any[] }).subjects
          : [],
        now,
        maxSubjects: throughput.targetSubjectsPerReplenishment,
      })
      curriculumReplenishment = {
        ok: true,
        skipped: failureDerived.inserted === 0,
        reason: failureDerived.inserted > 0 ? 'failure_derived_remediation_seeded_with_prepared_buffer_satisfied' : 'prepared_buffer_satisfied',
        failureDerivedInserted: failureDerived.inserted,
        failureDerivedBySubject: failureDerived.bySubject,
        externalCostUsd: 0,
      }
      if (failureDerived.inserted > 0) {
        curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now, {
          corpusScanRows: throughput.corpusScanRows,
          maxBatchesPerSweep: throughput.maxBatchesPerSweep,
        })) }
      }

      // A globally full prepared buffer must not strand a canonically underfilled remediation subject.
      // Re-read the post-remediation supply and run the existing bounded replenisher only for subjects
      // that still cannot satisfy the unchanged quality batch floor. This may acquire rights-cleared
      // material or install bounded teacher fallback, but it does not authorize provider dispatch,
      // production traffic, promotion, or any authority expansion.
      const postRemediationSupply = Array.isArray((curriculum.supply as { subjects?: unknown })?.subjects)
        ? (curriculum.supply as { subjects: any[] }).subjects
        : []
      // Persisted corrective curriculum remains a remediation obligation until canonical packaging closes
      // its shortfall. `bySubject` only describes newly unremediated failures in this invocation, so using
      // it alone loses the subject on the next maintenance pass after seeding.
      const remediationSubjects = new Set([
        ...failureDerived.persistedRemediationSubjects,
        ...failureDerived.bySubject.map(item => item.subject),
      ])
      const remediationSupplyBySubject = new Map(
        postRemediationSupply.map(subject => [String(subject?.subject || ''), subject] as const),
      )
      const remediationShortfalls = [...remediationSubjects]
        .map(subject => remediationSupplyBySubject.get(subject) || {
          subjectKey: subject.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
          subject,
          canonicalSubjectId: null,
          uniqueBatchableItems: 0,
          shortfallToBatch: 64,
        })
        .filter(subject => Number(subject?.shortfallToBatch || 0) > 0)
      if (remediationShortfalls.length > 0) {
        curriculumReplenishment = { ...(await replenishUniversityMassDistillationCurriculum({
          supply: remediationShortfalls,
          now,
          maxSubjects: Math.min(throughput.targetSubjectsPerReplenishment, remediationShortfalls.length),
          queriesPerSubject: throughput.queriesPerSubject,
          maxCandidatesPerCycle: throughput.acquisitionCandidatesPerCycle,
        })) }
        const correctiveMaterialInserted = [
          curriculumReplenishment.accepted,
          curriculumReplenishment.failureDerivedInserted,
          curriculumReplenishment.hostedTeacherInserted,
          curriculumReplenishment.syntheticInserted,
        ].reduce<number>((sum, value) => sum + Math.max(0, Number(value || 0)), 0)
        if (correctiveMaterialInserted > 0) {
          curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now, {
            corpusScanRows: throughput.corpusScanRows,
            maxBatchesPerSweep: throughput.maxBatchesPerSweep,
          })) }
        }
      }
    } else {
      openSourceMaintenance = { ok: true, skipped: true, reason: 'shortfall_replenishment_active', externalCostUsd: 0 }
      curriculumReplenishment = { ...(await replenishUniversityMassDistillationCurriculum({
        supply: Array.isArray((curriculum.supply as { subjects?: unknown })?.subjects)
          ? (curriculum.supply as { subjects: any[] }).subjects
          : [],
        now,
        maxSubjects: throughput.targetSubjectsPerReplenishment,
        queriesPerSubject: throughput.queriesPerSubject,
        maxCandidatesPerCycle: throughput.acquisitionCandidatesPerCycle,
      })) }
      const replenishmentMaterialInserted = [
        curriculumReplenishment.accepted,
        curriculumReplenishment.failureDerivedInserted,
        curriculumReplenishment.hostedTeacherInserted,
        curriculumReplenishment.syntheticInserted,
      ].reduce<number>((sum, value) => sum + Math.max(0, Number(value || 0)), 0)
      if (replenishmentMaterialInserted > 0) {
        curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now, {
          corpusScanRows: throughput.corpusScanRows,
          maxBatchesPerSweep: throughput.maxBatchesPerSweep,
        })) }
      }
    }
    preparedAfterReplenishment = await preparedMassDistillationInventory(preparedBufferTarget)
  } catch (error) {
    curriculum = { ok: false, error: safeError(error), externalCostUsd: 0, dispatchAuthorized: false }
    curriculumReplenishment = { ok: false, error: safeError(error), externalCostUsd: 0 }
  }
  } else {
    curriculum = { ok: true, skipped: true, reason: 'maintenance_not_due', externalCostUsd: 0, dispatchAuthorized: false }
    curriculumReplenishment = { ok: true, skipped: true, reason: 'maintenance_not_due', externalCostUsd: 0 }
    openSourceMaintenance = { ok: true, skipped: true, reason: 'maintenance_not_due', externalCostUsd: 0 }
  }
  const consumerSkipped = 'skipped' in result && result.skipped === true
  const reconciliationSkipped = 'skipped' in reconciliation && reconciliation.skipped === true
  const diagnosticsSkipped = 'skipped' in diagnostics && diagnostics.skipped === true
  const providerStorageRecoverySkipped = 'skipped' in providerStorageRecovery && providerStorageRecovery.skipped === true
  const stalledDispatchRecoverySkipped = 'skipped' in stalledDispatchRecovery && stalledDispatchRecovery.skipped === true
  const recoverySkipped = 'skipped' in recovery && recovery.skipped === true
  const capacityRecoverySkipped = 'skipped' in capacityRecovery && capacityRecovery.skipped === true
  const skipped = consumerSkipped && reconciliationSkipped && diagnosticsSkipped
    && providerStorageRecoverySkipped && stalledDispatchRecoverySkipped && recoverySkipped && capacityRecoverySkipped
  const supportingStepsSucceeded = reconciliation.ok === true
    && diagnostics.ok === true
    && providerStorageRecovery.ok === true
    && stalledDispatchRecovery.ok === true
    && recovery.ok === true
    && campaignClosure.ok === true
    && terminalCleanup.ok === true
    && semanticReconciliation.ok === true
    && curriculum.ok === true
    && curriculumReplenishment.ok === true
    && rollingAuthorization.ok === true
    && capacityRecovery.ok === true
    && postRecoveryAuthorization.ok === true
    && postRecoveryConsumer.ok === true
  const invocationSucceeded = result.ok === true && supportingStepsSucceeded
  // A provider-stage miss remains failed evidence, but when the consumer explicitly schedules a bounded
  // retry and every surrounding control/recovery step is healthy, the cron transport itself is healthy.
  // This prevents Vercel from treating self-healing progress as an outage while preserving the failed
  // stage in the durable Production receipt. Hard failures, blocked retries, or any unhealthy supporting
  // step remain transport failures.
  const retryScheduled = result.ok !== true
    && result.degraded === true
    && result.automaticRetryAuthorized === true
    && result.automaticPromotionAuthorized === false
    && result.runpodMutationAuthorized === false
    && result.semantics === 'failed_stages_scheduled_for_bounded_retry_while_other_campaign_work_continues'
  const transportSucceeded = invocationSucceeded || (retryScheduled && supportingStepsSucceeded)

  return {
    response: {
      ...result,
      ok: invocationSucceeded,
      skipped,
      consumer: result,
      initialConsumer: initialResult,
      capacityRecovery,
      postRecoveryAuthorization,
      postRecoveryConsumer,
      reconciliation,
      diagnostics,
    providerStorageRecovery,
      stalledDispatchRecovery,
      recovery,
      campaignClosure,
      terminalCleanup,
      semanticReconciliation,
      curriculum,
      curriculumReplenishment,
      openSourceMaintenance,
      throughput,
      teacherPool,
      preparedBufferTarget,
      preparedBeforeReplenishment,
      preparedAfterReplenishment,
      rollingAuthorization,
      evaluationBacklog,
      backlogDrainMode,
      slowMaintenanceDue,
      workflowSource: input.source,
      retryScheduled,
      transportSucceeded,
      workflowSemantics: 'detect_repair_evict_inert_capacity_same_tick_reauthorize_dispatch_fill_available_dynamic_capacity_dispatch_any_compatible_lane_before_maintenance_revalidate_prepared_semantics_package_maintain_buyer_controlled_prepared_inventory_continue_bounded_rights_cleared_source_harvest_diversify_rights_cleared_shortfall_queries_expose_enterprise_teacher_pool_verify',
    },
    invocationSucceeded,
    transportSucceeded,
    skipped,
  }
}

async function runCosUniversityMassDistillationWorkflowInsideHarness(input: {
  source: MassDistillationWorkflowSource
  now?: Date
}): Promise<{
  response: Record<string, unknown>
  invocationSucceeded: boolean
  transportSucceeded: boolean
  skipped: boolean
}> {
  let lease: Awaited<ReturnType<typeof claimUniversityMassDistillationWorkflowLease>>
  try {
    lease = await claimUniversityMassDistillationWorkflowLease()
  } catch (error) {
    const message = safeError(error)
    console.error('[cos-university-mass-distillation-lease]', JSON.stringify({
      ok: false,
      reason: 'workflow_lease_unavailable',
      error: message,
    }))
    return {
      response: {
        ok: false,
        skipped: false,
        reason: 'workflow_lease_unavailable',
        error: message,
        workflowSource: input.source,
        workflowLease: { acquired: false, failClosed: true },
      },
      invocationSucceeded: false,
      transportSucceeded: false,
      skipped: false,
    }
  }

  if (!lease.acquired) {
    return {
      response: {
        ok: true,
        skipped: true,
        reason: 'workflow_lease_held',
        workflowSource: input.source,
        workflowLease: {
          acquired: false,
          expiresAt: lease.expiresAt,
          ttlSeconds: lease.ttlSeconds,
        },
        automaticPromotionAuthorized: false,
        runpodMutationAuthorized: false,
        authorityExpanded: false,
      },
      invocationSucceeded: true,
      transportSucceeded: true,
      skipped: true,
    }
  }

  try {
    const outcome = await runOwnedCosUniversityMassDistillationWorkflow(input)
    return {
      ...outcome,
      response: {
        ...outcome.response,
        workflowLease: {
          acquired: true,
          expiresAt: lease.expiresAt,
          ttlSeconds: lease.ttlSeconds,
        },
      },
    }
  } finally {
    try {
      await releaseUniversityMassDistillationWorkflowLease(lease.ownerToken)
    } catch (error) {
      console.error('[cos-university-mass-distillation-lease]', JSON.stringify({
        ok: false,
        reason: 'workflow_lease_release_failed',
        error: safeError(error),
      }))
    }
  }
}


/** Scheduled and Self-Healing distillation must never start outside a HarnessRun. */
export async function runCosUniversityMassDistillationWorkflow(
  input: Parameters<typeof runCosUniversityMassDistillationWorkflowInsideHarness>[0],
): ReturnType<typeof runCosUniversityMassDistillationWorkflowInsideHarness> {
  return withHostProductionHarnessIngress({
    objective: `Run COS University mass distillation (${input.source})`,
    portableId: 'cos-university',
    agentId: 'cos-university-mass-distillation',
    role: 'university_worker',
    capabilityId: 'university.distillation.execute',
    risk: 'write',
    deadlineMs: 300_000,
    maxConcurrency: 1,
    maxToolCalls: 200,
  }, () => runCosUniversityMassDistillationWorkflowInsideHarness(input))
}
