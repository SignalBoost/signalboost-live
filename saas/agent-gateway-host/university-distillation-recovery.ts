import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import { runCosUniversityMassDistillationWorkflow } from '../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'
import { preflightHfWorkerDelivery } from '../lib/ai/cos/cosUniversityHfWorkerDelivery.ts'
import { recordCosUniversityProductionPath } from '../lib/ai/cos/cosUniversityProductionAssurance.ts'
import {
  readUniversityMassDistillationHealth,
  UNIVERSITY_DISTILLATION_RECOVERY_TARGET,
  type UniversityDistillationHealthSnapshot,
} from '../self-healing-host/university-distillation-monitoring.ts'

export const UNIVERSITY_DISTILLATION_RECOVERY_KIND = 'supervisor_repair'

export const UNIVERSITY_DISTILLATION_RECOVERY_ALLOWLIST_ENTRY: AllowlistEntry = Object.freeze({
  actionKind: UNIVERSITY_DISTILLATION_RECOVERY_KIND,
  target: UNIVERSITY_DISTILLATION_RECOVERY_TARGET,
  rollback: 'stop later retry ticks; preserve the existing campaign, provider, and cost ledgers without expanding authority',
})

export interface UniversityDistillationRecoveryResult {
  startedAt: string
  finishedAt: string
  receiptRef: string | null
  invocationSucceeded: boolean
  skipped: boolean
  verified: boolean
  before: UniversityDistillationHealthSnapshot
  after: UniversityDistillationHealthSnapshot
  response: Record<string, unknown>
  automaticPromotionAuthorized: false
  runpodMutationAuthorized: false
  authorityExpanded: false
}

type WorkflowRunner = typeof runCosUniversityMassDistillationWorkflow
type ReceiptRecorder = typeof recordCosUniversityProductionPath
type HealthReader = typeof readUniversityMassDistillationHealth
type WorkerPreflight = typeof preflightHfWorkerDelivery

/**
 * Executes the same bounded workflow used by the five-minute cron and then performs a separate
 * durable health read. The Supervisor never receives a free-form provider action or a new budget:
 * every paid claim passes either the original campaign fences or the durable owner-approved
 * single-batch rolling policy, and both paths retain the existing per-stage cost ceilings.
 *
 * Owner policy for this registered operational recovery is autonomous: no separate human approval
 * is required. Before any recovery can dispatch paid Hugging Face work, however, the Supervisor
 * must prove the signed iTMounts worker artifact is reachable and structurally valid. A failed
 * preflight blocks spending and is retried on a later Supervisor tick instead of launching jobs.
 */
export async function recoverUniversityMassDistillation(input: {
  db: any
  now?: () => Date
  runWorkflow?: WorkflowRunner
  recordReceipt?: ReceiptRecorder
  readHealth?: HealthReader
  preflightWorker?: WorkerPreflight
}): Promise<UniversityDistillationRecoveryResult> {
  const now = input.now ?? (() => new Date())
  const runWorkflow = input.runWorkflow ?? runCosUniversityMassDistillationWorkflow
  const recordReceipt = input.recordReceipt ?? recordCosUniversityProductionPath
  const readHealth = input.readHealth ?? readUniversityMassDistillationHealth
  const preflightWorker = input.preflightWorker ?? preflightHfWorkerDelivery
  const startedAt = now()
  const before = await readHealth({ db: input.db, now: startedAt })
  // The offset monitor can race a successful scheduled worker. Treat any independently observed
  // non-repair state as an idempotent verified no-op instead of turning healing into a failure.
  if (before.state !== 'repair_required') {
    const finishedAt = now()
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      receiptRef: null,
      invocationSucceeded: true,
      skipped: true,
      verified: true,
      before,
      after: before,
      response: { ok: true, skipped: true, reason: `university_distillation_already_${before.state}` },
      automaticPromotionAuthorized: false,
      runpodMutationAuthorized: false,
      authorityExpanded: false,
    }
  }
  if (!before.automaticRecoveryAuthorized) throw new Error('university_distillation_recovery_not_authorized')

  const workerPreflight = await preflightWorker()
  if (!workerPreflight.ok) {
    await recordReceipt({
      path: 'mass_distillation_campaign',
      invocationSucceeded: false,
      evidence: {
        runnerInvoked: false,
        supervisorRecovery: true,
        repairContained: true,
        paidDispatchSuppressed: true,
        reason: workerPreflight.reason,
        workerStatus: workerPreflight.status,
        workerBytes: workerPreflight.bytes,
        automaticRetryOnLaterSupervisorTick: true,
        automaticPromotionAuthorized: false,
        runpodMutationAuthorized: false,
        authorityExpanded: false,
      },
      now: now(),
    }).catch(() => null)
    throw new Error(`university_distillation_worker_preflight_failed:${workerPreflight.reason || 'unknown'}`)
  }

  const workflow = await runWorkflow({ source: 'self_healing_supervisor', now: now() })
  const receiptRef = await recordReceipt({
    path: 'mass_distillation_campaign',
    invocationSucceeded: workflow.invocationSucceeded,
    evidence: {
      ...workflow.response,
      runnerInvoked: !workflow.skipped,
      skipped: workflow.skipped,
      supervisorRecovery: true,
      workerPreflightPassed: true,
      workerSha256: workerPreflight.sha256,
      workerBytes: workerPreflight.bytes,
      repairScope: before.activeCampaigns > 0
        ? 'same_campaign_expiration_and_remaining_budget'
        : 'one_prepared_batch_within_owner_rolling_24h_maximum_authority',
      authorityExpanded: false,
    },
    now: now(),
  })
  if (!receiptRef) throw new Error('university_distillation_recovery_receipt_not_persisted')

  const finishedAt = now()
  const after = await readHealth({ db: input.db, now: finishedAt })
  const verified = workflow.invocationSucceeded && after.state !== 'repair_required'
  if (!verified) {
    throw new Error(`university_distillation_recovery_verification_failed:${after.reasons.join(',') || 'workflow_failed'}`)
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    receiptRef,
    invocationSucceeded: workflow.invocationSucceeded,
    skipped: workflow.skipped,
    verified,
    before,
    after,
    response: workflow.response,
    automaticPromotionAuthorized: false,
    runpodMutationAuthorized: false,
    authorityExpanded: false,
  }
}

export function createUniversityDistillationRecoveryExecutor(input: {
  db: any | (() => any)
  recover?: typeof recoverUniversityMassDistillation
  id?: string
}): ChainExecutor {
  return {
    id: input.id ?? 'university-mass-distillation-recovery',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      if (request.action.kind !== UNIVERSITY_DISTILLATION_RECOVERY_KIND) {
        return { handled: false, reason: 'not a supervisor repair action' }
      }
      if (request.action.target !== UNIVERSITY_DISTILLATION_RECOVERY_TARGET) {
        return { handled: false, reason: 'no University distillation recovery mapping' }
      }
      try {
        const db = typeof input.db === 'function' ? input.db() : input.db
        const result = await (input.recover ?? recoverUniversityMassDistillation)({ db })
        return { handled: true, ok: true, result }
      } catch (error) {
        return {
          handled: true,
          ok: false,
          error: error instanceof Error ? error.message : 'University distillation recovery failed',
        }
      }
    },
  }
}
