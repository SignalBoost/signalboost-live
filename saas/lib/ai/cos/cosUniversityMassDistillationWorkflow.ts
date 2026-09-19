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
  MASS_DISTILLATION_MIN_BATCH,
  MASS_DISTILLATION_STUDENT_MODEL,
  prepareUniversityMassDistillationCurriculum,
} from './cosUniversityMassDistillation.ts'
import { installVerifiedFailureDerivedCurriculum, replenishUniversityMassDistillationCurriculum } from './cosUniversityDistillationCurriculumReplenishment.ts'
import { massDistillationThroughputProfile } from './cosUniversityDistillationCurriculumPlan.ts'
import { authorizeNextUniversityMassDistillationCampaign } from './cosUniversityMassDistillationRollingAuthorization.ts'
import { diagnoseFailedMassDistillationHuggingFaceJobs } from './cosUniversityHuggingFaceJobDiagnostics.ts'
import { reconcileMassDistillationHuggingFaceProviderLedger } from './cosUniversityHuggingFaceProviderLedger.ts'
import { universityTeacherPoolStatus } from './cosUniversityTeacherPool.ts'
import { terminalizeFailedMassDistillationCampaignRuns } from './cosUniversityMassDistillationTerminalCleanup.ts'
import { reconcilePreparedMassDistillationSemanticCohesion } from './cosUniversityMassDistillationSemanticReconciliation.ts'

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
      .gte('source_count', MASS_DISTILLATION_MIN_BATCH)
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
export async function runCosUniversityMassDistillationWorkflow(input: {
  source: MassDistillationWorkflowSource
  now?: Date
}): Promise<{
  response: Record<string, unknown>
  invocationSucceeded: boolean
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
  const stalledDispatchRecovery = await isolatedStep('stalled_dispatch_recovery', () =>
    recoverStalledMassDistillationDispatchClaims({ now, maxRuns: 5 }))
  const recovery = slowMaintenanceDue
    ? await isolatedStep('campaign_recovery', () => recoverMassDistillationCampaigns({ now, maxCampaigns: 3 }))
    : { ok: true, skipped: true, step: 'campaign_recovery', reason: 'maintenance_not_due' }
  // Dispatch is the critical path. Do it before semantic/curriculum maintenance so an already
  // authorized prepared batch cannot be starved by slow reconciliation or replenishment work.
  let rollingAuthorization: Record<string, unknown>
  const dispatchReadiness = massDistillationDispatchReadiness()
  try {
    rollingAuthorization = dispatchReadiness.ready
      ? { ...(await authorizeNextUniversityMassDistillationCampaign()) }
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
  const result = await runMassDistillationCampaignConsumer({ now, maxDispatches: 3 })
  const semanticReconciliation = slowMaintenanceDue
    ? await isolatedStep('semantic_reconciliation', () => reconcilePreparedMassDistillationSemanticCohesion({ maxBatches: 20 }))
    : { ok: true, skipped: true, step: 'semantic_reconciliation', reason: 'maintenance_not_due' }
  const preparedBufferTarget = throughput.preparedBatchBufferTarget
  let preparedBeforeReplenishment = 0
  let preparedAfterReplenishment = 0
  let curriculum: Record<string, unknown>
  let curriculumReplenishment: Record<string, unknown> = { ok: true, skipped: true, reason: 'prepared_buffer_satisfied', externalCostUsd: 0 }
  if (slowMaintenanceDue) {
  try {
    curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now, {
      corpusScanRows: throughput.corpusScanRows,
      maxBatchesPerSweep: throughput.maxBatchesPerSweep,
    })) }
    preparedBeforeReplenishment = await preparedMassDistillationInventory(preparedBufferTarget)
    if (preparedBeforeReplenishment >= preparedBufferTarget) {
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
    } else {
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
  }
  const consumerSkipped = 'skipped' in result && result.skipped === true
  const reconciliationSkipped = 'skipped' in reconciliation && reconciliation.skipped === true
  const diagnosticsSkipped = 'skipped' in diagnostics && diagnostics.skipped === true
  const stalledDispatchRecoverySkipped = 'skipped' in stalledDispatchRecovery && stalledDispatchRecovery.skipped === true
  const recoverySkipped = 'skipped' in recovery && recovery.skipped === true
  const skipped = consumerSkipped && reconciliationSkipped && diagnosticsSkipped
    && stalledDispatchRecoverySkipped && recoverySkipped
  const invocationSucceeded = result.ok === true
    && reconciliation.ok === true
    && diagnostics.ok === true
    && stalledDispatchRecovery.ok === true
    && recovery.ok === true
    && campaignClosure.ok === true
    && terminalCleanup.ok === true
    && semanticReconciliation.ok === true
    && curriculum.ok === true
    && curriculumReplenishment.ok === true
    && rollingAuthorization.ok === true

  return {
    response: {
      ...result,
      ok: invocationSucceeded,
      skipped,
      consumer: result,
      reconciliation,
      diagnostics,
      stalledDispatchRecovery,
      recovery,
      campaignClosure,
      terminalCleanup,
      semanticReconciliation,
      curriculum,
      curriculumReplenishment,
      throughput,
      teacherPool,
      preparedBufferTarget,
      preparedBeforeReplenishment,
      preparedAfterReplenishment,
      rollingAuthorization,
      slowMaintenanceDue,
      workflowSource: input.source,
      workflowSemantics: 'detect_repair_authorize_dispatch_before_maintenance_revalidate_prepared_semantics_package_maintain_buyer_controlled_prepared_inventory_diversify_rights_cleared_shortfall_queries_expose_enterprise_teacher_pool_verify',
    },
    invocationSucceeded,
    skipped,
  }
}
