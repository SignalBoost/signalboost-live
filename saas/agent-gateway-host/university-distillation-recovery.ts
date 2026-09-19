import { createHash } from 'node:crypto'
import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import { runCosUniversityMassDistillationWorkflow } from '../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'
import { preflightHfWorkerDelivery } from '../lib/ai/cos/cosUniversityHfWorkerDelivery.ts'
import { recordCosUniversityProductionPath } from '../lib/ai/cos/cosUniversityProductionAssurance.ts'
import { RECOVERY_DRILL_PROFILE } from '../lib/ai/cos/cosUniversityRecoveryDrill.ts'
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


const MASS_RUNS = 'cos_university_mass_distillation_batch_runs'
const ASSURANCE_EVENTS = 'cos_university_learning_assurance_events'
const DRILL_DISPATCH_STAGES = ['teacher_dispatching', 'preparation_dispatching', 'training_dispatching'] as const

type RecoveryDrillRepair = Readonly<{
  drillId: string
  runId: string
  eventRef: string
}>

/**
 * A recovery drill fixture is intentionally unclaimable and stage-immutable, so the ordinary
 * mass-distillation workflow cannot clear it. The Supervisor may remove only a fixture that is
 * cryptographically attributable to a still-armed drill record in the assurance ledger.
 *
 * This path is zero-spend: it creates no provider job, changes no campaign budget, grants no
 * Production traffic, and never touches a non-drill run. Deletion is the repair because the
 * synthetic stalled row is the injected fault. Durable supervisor evidence lets the owner-only
 * drill observer distinguish autonomous repair from manual interference.
 */
async function repairVerifiedRecoveryDrillFixture(input: {
  db: any
  before: UniversityDistillationHealthSnapshot
  now: Date
}): Promise<RecoveryDrillRepair | null> {
  if (!input.before.reasons.includes('dispatch_claim_stalled') || input.before.activeCampaignIds.length === 0) return null

  const rowsResult = await input.db.from(MASS_RUNS)
    .select('id,campaign_id,subject_id,stage,drill_id')
    .in('campaign_id', input.before.activeCampaignIds)
    .in('stage', [...DRILL_DISPATCH_STAGES])
    .not('drill_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(5)
  if (rowsResult.error) throw new Error(`university_recovery_drill_row_read_failed:${String(rowsResult.error.message || 'unknown').slice(0, 180)}`)

  for (const raw of rowsResult.data || []) {
    const runId = String(raw.id || '').trim()
    const campaignId = String(raw.campaign_id || '').trim()
    const drillId = String(raw.drill_id || '').trim()
    if (!runId || !campaignId || !drillId || !input.before.activeCampaignIds.includes(campaignId)) continue

    const eventResult = await input.db.from(ASSURANCE_EVENTS)
      .select('candidate_id,evidence,observed_at')
      .eq('event_type', 'fine_tune')
      .eq('candidate_id', `drill:${drillId}`)
      .eq('verifier', 'host_controller')
      .contains('evidence', { profile: RECOVERY_DRILL_PROFILE, claim: 'recovery_drill_armed', drillId })
      .order('observed_at', { ascending: false })
      .limit(10)
    if (eventResult.error) throw new Error(`university_recovery_drill_evidence_read_failed:${String(eventResult.error.message || 'unknown').slice(0, 180)}`)

    const armed = (eventResult.data || []).find((event: any) => {
      const drill = event.evidence?.drill
      return drill?.drillId === drillId
        && drill?.injectedRunId === runId
        && drill?.faultKind === 'dispatch_claim_stalled'
        && event.evidence?.campaignId === campaignId
        && Number.isFinite(Date.parse(String(drill?.expiresAt || '')))
        && Date.parse(String(drill.expiresAt)) > input.now.getTime()
    })
    if (!armed) continue

    const removed = await input.db.from(MASS_RUNS)
      .delete()
      .eq('id', runId)
      .eq('campaign_id', campaignId)
      .eq('drill_id', drillId)
      .select('id')
    if (removed.error) throw new Error(`university_recovery_drill_clear_failed:${String(removed.error.message || 'unknown').slice(0, 180)}`)
    if ((removed.data || []).length !== 1) throw new Error('university_recovery_drill_clear_not_exact')

    const evidence = {
      profile: RECOVERY_DRILL_PROFILE,
      claim: 'recovery_drill_repair_applied',
      drillId,
      drillRunId: runId,
      campaignId,
      faultKind: 'dispatch_claim_stalled',
      repairKind: 'remove_inert_stalled_dispatch_fixture',
      dispatchAuthorized: false,
      spendAuthorized: false,
      productionTrafficAuthorized: false,
      automaticPromotionAuthorized: false,
      runpodMutationAuthorized: false,
      authorityExpanded: false,
    }
    const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
    const eventKey = createHash('sha256').update(JSON.stringify([
      RECOVERY_DRILL_PROFILE,
      'recovery_drill_repair_applied',
      drillId,
      runId,
      evidenceHash,
    ])).digest('hex')
    const recorded = await input.db.from(ASSURANCE_EVENTS).upsert({
      event_key: eventKey,
      event_type: 'fine_tune',
      subject_id: String(raw.subject_id || 'Reasoning & Decision Science'),
      candidate_id: `drill:${drillId}`,
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'self_healing_supervisor',
      observed_at: input.now.toISOString(),
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (recorded.error) throw new Error(`university_recovery_drill_evidence_write_failed:${String(recorded.error.message || 'unknown').slice(0, 180)}`)

    return { drillId, runId, eventRef: `db://cos_university_learning_assurance_events/${eventKey}` }
  }
  return null
}

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

  // Recovery-drill fixtures are deliberately excluded from the paid claim path. Clear only an
  // exact, still-armed fixture first; if that was the only fault, verification completes here
  // without touching Hugging Face or campaign spend. If another real fault remains, continue into
  // the ordinary governed recovery below.
  const drillRepair = await repairVerifiedRecoveryDrillFixture({ db: input.db, before, now: now() })
  if (drillRepair) {
    const afterDrill = await readHealth({ db: input.db, now: now() })
    if (afterDrill.state !== 'repair_required') {
      const finishedAt = now()
      return {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        receiptRef: drillRepair.eventRef,
        invocationSucceeded: true,
        skipped: false,
        verified: true,
        before,
        after: afterDrill,
        response: {
          ok: true,
          supervisorRecovery: true,
          recoveryDrillRepaired: true,
          drillId: drillRepair.drillId,
          drillRunId: drillRepair.runId,
          paidDispatchSuppressed: true,
          automaticPromotionAuthorized: false,
          runpodMutationAuthorized: false,
          authorityExpanded: false,
        },
        automaticPromotionAuthorized: false,
        runpodMutationAuthorized: false,
        authorityExpanded: false,
      }
    }
  }

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
      ...(drillRepair ? { recoveryDrillRepaired: true, drillId: drillRepair.drillId, drillRunId: drillRepair.runId } : {}),
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
