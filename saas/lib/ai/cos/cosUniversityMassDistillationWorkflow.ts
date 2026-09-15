import {
  recoverMassDistillationCampaigns,
  recoverStalledMassDistillationDispatchClaims,
  runMassDistillationCampaignConsumer,
} from './cosUniversityMassDistillationConsumer.ts'
import { diagnoseFailedMassDistillationHuggingFaceJobs } from './cosUniversityHuggingFaceJobDiagnostics.ts'
import { reconcileMassDistillationHuggingFaceProviderLedger } from './cosUniversityHuggingFaceProviderLedger.ts'

export type MassDistillationWorkflowSource = 'scheduled_cron' | 'self_healing_supervisor'

/**
 * One canonical distillation control loop shared by the scheduled worker and the Self-Healing
 * Supervisor. Keeping the order here prevents the repair path from drifting into a second,
 * weaker implementation: accepted provider work is reconciled, terminal failures are diagnosed,
 * interrupted dispatch claims and bounded retries are re-armed, and only then may another
 * authorized stage be claimed.
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
      workflowSource: input.source,
      workflowSemantics: 'detect_diagnose_repair_verify_within_existing_campaign_authority',
    },
    invocationSucceeded,
    skipped,
  }
}
