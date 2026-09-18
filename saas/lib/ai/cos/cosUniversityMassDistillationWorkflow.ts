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

export type MassDistillationWorkflowSource = 'scheduled_cron' | 'self_healing_supervisor'

function safeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error || 'unknown_error').replace(/\s+/g, ' ').trim().slice(0, 300)
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
  const pageSize = 500
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
 * Supervisor. Accepted provider work is reconciled first. Non-spending curriculum preparation then
 * maintains buyer/owner-configured ready inventory independently of paid training authority, so
 * training need not wait for acquisition after capacity becomes available. Paid dispatch remains
 * bounded by the University's separate owner-approved rolling policy.
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
  const reconciliation = await reconcileMassDistillationHuggingFaceProviderLedger({ now, maxJobs: 15 })
  const diagnostics = await diagnoseFailedMassDistillationHuggingFaceJobs({ maxJobs: 5 })
  const stalledDispatchRecovery = await recoverStalledMassDistillationDispatchClaims({ now, maxRuns: 10 })
  const recovery = await recoverMassDistillationCampaigns({ now, maxCampaigns: 5 })
  const campaignClosure = await closeExpiredMassDistillationCampaigns({ now, maxCampaigns: 10 })
  const terminalCleanup = await terminalizeFailedMassDistillationCampaignRuns({ maxCampaigns: 20 })
  const preparedBufferTarget = throughput.preparedBatchBufferTarget
  let preparedBeforeReplenishment = 0
  let preparedAfterReplenishment = 0
  let curriculum: Record<string, unknown>
  let curriculumReplenishment: Record<string, unknown> = { ok: true, skipped: true, reason: 'prepared_buffer_satisfied', externalCostUsd: 0 }
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
      if (Number(curriculumReplenishment.accepted || 0) > 0) {
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
  const consumerSkipped = 'skipped' in result && result.skipped === true
  const reconciliationSkipped = 'skipped' in reconciliation && reconciliation.skipped === true
  const diagnosticsSkipped = 'skipped' in diagnostics && diagnostics.skipped === true
  const stalledDispatchRecoverySkipped = stalledDispatchRecovery.skipped === true
  const recoverySkipped = recovery.skipped === true
  const skipped = consumerSkipped && reconciliationSkipped && diagnosticsSkipped
    && stalledDispatchRecoverySkipped && recoverySkipped
  const invocationSucceeded = result.ok === true
    && reconciliation.ok === true
    && diagnostics.ok === true
    && stalledDispatchRecovery.ok === true
    && recovery.ok === true
    && campaignClosure.ok === true
    && terminalCleanup.ok === true
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
      curriculum,
      curriculumReplenishment,
      throughput,
      teacherPool,
      preparedBufferTarget,
      preparedBeforeReplenishment,
      preparedAfterReplenishment,
      rollingAuthorization,
      workflowSource: input.source,
      workflowSemantics: 'detect_diagnose_repair_package_maintain_buyer_controlled_prepared_inventory_diversify_rights_cleared_shortfall_queries_expose_enterprise_teacher_pool_authorize_within_owner_rolling_24h_ceiling_dispatch_verify',
    },
    invocationSucceeded,
    skipped,
  }
}
