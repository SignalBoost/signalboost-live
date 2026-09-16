import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  massDistillationDispatchReadiness,
  recoverMassDistillationCampaigns,
  recoverStalledMassDistillationDispatchClaims,
  runMassDistillationCampaignConsumer,
} from './cosUniversityMassDistillationConsumer.ts'
import {
  MASS_DISTILLATION_MAX_BATCH,
  MASS_DISTILLATION_MIN_BATCH,
  MASS_DISTILLATION_STUDENT_MODEL,
  prepareUniversityMassDistillationCurriculum,
} from './cosUniversityMassDistillation.ts'
import { replenishUniversityMassDistillationCurriculum } from './cosUniversityDistillationCurriculumReplenishment.ts'
import { massDistillationPreparedBatchBufferTarget } from './cosUniversityDistillationCurriculumPlan.ts'
import { authorizeNextUniversityMassDistillationCampaign } from './cosUniversityMassDistillationRollingAuthorization.ts'
import { diagnoseFailedMassDistillationHuggingFaceJobs } from './cosUniversityHuggingFaceJobDiagnostics.ts'
import { reconcileMassDistillationHuggingFaceProviderLedger } from './cosUniversityHuggingFaceProviderLedger.ts'

export type MassDistillationWorkflowSource = 'scheduled_cron' | 'self_healing_supervisor'

function safeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error || 'unknown_error').replace(/\s+/g, ' ').trim().slice(0, 300)
}

/** Count only prepared batches that have never entered a campaign. */
async function preparedMassDistillationInventory(): Promise<number> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const prepared = await db.from('cos_university_distillation_curriculum_batches')
    .select('batch_key')
    .eq('status', 'prepared')
    .eq('dispatch_authorized', false)
    .eq('authority_expanded', false)
    .eq('student_model_id', MASS_DISTILLATION_STUDENT_MODEL)
    .gte('source_count', MASS_DISTILLATION_MIN_BATCH)
    .lte('source_count', MASS_DISTILLATION_MAX_BATCH)
    .order('prepared_at', { ascending: true })
    .limit(500)
  if (prepared.error) throw prepared.error
  const keys = (prepared.data || []).map((row: any) => String(row.batch_key || '')).filter(Boolean)
  if (!keys.length) return 0
  const consumed = await db.from('cos_university_mass_distillation_batch_runs')
    .select('batch_key')
    .in('batch_key', keys)
    .limit(500)
  if (consumed.error) throw consumed.error
  const used = new Set((consumed.data || []).map((row: any) => String(row.batch_key || '')).filter(Boolean))
  return keys.filter(key => !used.has(key)).length
}

/**
 * One canonical distillation control loop shared by the scheduled worker and the Self-Healing
 * Supervisor. Accepted provider work is reconciled first. Non-spending curriculum preparation then
 * maintains a ready inventory independently of paid training authority, so training need not wait
 * for acquisition after capacity becomes available. Paid dispatch remains bounded by the owner's
 * durable rolling policy and existing campaign fences.
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
  const reconciliation = await reconcileMassDistillationHuggingFaceProviderLedger({ now, maxJobs: 15 })
  const diagnostics = await diagnoseFailedMassDistillationHuggingFaceJobs({ maxJobs: 5 })
  const stalledDispatchRecovery = await recoverStalledMassDistillationDispatchClaims({ now, maxRuns: 10 })
  const recovery = await recoverMassDistillationCampaigns({ now, maxCampaigns: 5 })
  const preparedBufferTarget = massDistillationPreparedBatchBufferTarget()
  let preparedBeforeReplenishment = 0
  let preparedAfterReplenishment = 0
  let curriculum: Record<string, unknown>
  let curriculumReplenishment: Record<string, unknown> = { ok: true, skipped: true, reason: 'prepared_buffer_satisfied', externalCostUsd: 0 }
  try {
    curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now)) }
    preparedBeforeReplenishment = await preparedMassDistillationInventory()
    if (preparedBeforeReplenishment < preparedBufferTarget) {
      curriculumReplenishment = { ...(await replenishUniversityMassDistillationCurriculum({
        supply: Array.isArray((curriculum.supply as { subjects?: unknown })?.subjects)
          ? (curriculum.supply as { subjects: any[] }).subjects
          : [],
        now,
      })) }
      if (Number(curriculumReplenishment.accepted || 0) > 0) {
        curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now)) }
      }
    }
    preparedAfterReplenishment = await preparedMassDistillationInventory()
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
  // A disabled provider or missing service database is reported as `skipped` by the leaf helper,
  // but it is not a successful workflow heartbeat. Benign no-work cases already return ok=true.
  const invocationSucceeded = result.ok === true
    && reconciliation.ok === true
    && diagnostics.ok === true
    && stalledDispatchRecovery.ok === true
    && recovery.ok === true
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
      curriculum,
      curriculumReplenishment,
      preparedBufferTarget,
      preparedBeforeReplenishment,
      preparedAfterReplenishment,
      rollingAuthorization,
      workflowSource: input.source,
      workflowSemantics: 'detect_diagnose_repair_package_maintain_prepared_inventory_replenish_rights_cleared_shortfalls_authorize_within_owner_rolling_24h_ceiling_dispatch_verify',
    },
    invocationSucceeded,
    skipped,
  }
}
