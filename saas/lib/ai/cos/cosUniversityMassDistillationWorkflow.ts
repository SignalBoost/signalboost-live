import {
  massDistillationDispatchReadiness,
  recoverMassDistillationCampaigns,
  recoverStalledMassDistillationDispatchClaims,
  runMassDistillationCampaignConsumer,
} from './cosUniversityMassDistillationConsumer.ts'
import { prepareUniversityMassDistillationCurriculum } from './cosUniversityMassDistillation.ts'
import { replenishUniversityMassDistillationCurriculum } from './cosUniversityDistillationCurriculumReplenishment.ts'
import { authorizeNextUniversityMassDistillationCampaign } from './cosUniversityMassDistillationRollingAuthorization.ts'
import { diagnoseFailedMassDistillationHuggingFaceJobs } from './cosUniversityHuggingFaceJobDiagnostics.ts'
import { reconcileMassDistillationHuggingFaceProviderLedger } from './cosUniversityHuggingFaceProviderLedger.ts'

export type MassDistillationWorkflowSource = 'scheduled_cron' | 'self_healing_supervisor'

function safeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error || 'unknown_error').replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * One canonical distillation control loop shared by the scheduled worker and the Self-Healing
 * Supervisor. Keeping the order here prevents the repair path from drifting into a second,
 * weaker implementation: accepted provider work is reconciled, terminal failures are diagnosed,
 * interrupted dispatch claims and bounded retries are re-armed, the rights-cleared curriculum is
 * replenished, one next campaign may be authorized inside the owner's durable rolling ceiling, and
 * only then may another authorized stage be claimed.
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
  let curriculum: Record<string, unknown>
  let curriculumReplenishment: Record<string, unknown> = { ok: true, skipped: true, reason: 'curriculum_batch_available', externalCostUsd: 0 }
  try {
    curriculum = { ok: true, ...(await prepareUniversityMassDistillationCurriculum(now)) }
    if (Number(curriculum.batchesPrepared || 0) === 0) {
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
      rollingAuthorization,
      workflowSource: input.source,
      workflowSemantics: 'detect_diagnose_repair_package_replenish_targeted_rights_cleared_shortfalls_repackage_authorize_one_within_owner_rolling_24h_ceiling_dispatch_verify',
    },
    invocationSucceeded,
    skipped,
  }
}
