// A narrowly-scoped, pre-authorized recovery for scheduler/policy drift.
//
// The action never accepts a model-authored interval. It derives the desired cadence from the
// deployed host scheduler, only touches SignalBoost's system-owned Vercel observation policy,
// verifies the write with a separate read, and rolls back if verification does not match.
import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import { selfHealingHostCadence } from '../self-healing-host/host-scheduler.ts'

export const OBSERVATION_POLICY_DRIFT_ERROR_CODE = 'supervisor_observation_schedule_policy_drift'
export const OBSERVATION_POLICY_RECONCILE_KIND = 'supervisor_repair'
export const OBSERVATION_POLICY_RECONCILE_TARGET = 'platform.reconcile_observation_policy'
export const OBSERVATION_POLICY_INSTANCE_ID = 'vercel-observation-cron'
export const OBSERVATION_POLICY_ENVIRONMENT = 'production'
export const OBSERVATION_POLICY_RECOVERY_ACTOR = 'cos-self-healing'

export const OBSERVATION_POLICY_RECONCILE_ALLOWLIST_ENTRY: AllowlistEntry = Object.freeze({
  actionKind: OBSERVATION_POLICY_RECONCILE_KIND,
  target: OBSERVATION_POLICY_RECONCILE_TARGET,
  rollback: 'restore the previous system-owned observation interval, rationale, and updater if verification fails',
})

export interface ObservationPolicyRecoveryResult {
  changed: boolean
  policyInstanceId: string
  previousIntervalSeconds: number
  currentIntervalSeconds: number
  schedulerSchedule: string
  nativeMonitoringIntervalSeconds: number
  verified: boolean
}

function managedBySystem(value: unknown): boolean {
  const updater = String(value ?? '').trim()
  return updater === '' || updater === 'system' || updater === OBSERVATION_POLICY_RECOVERY_ACTOR
}

/**
 * Reconcile the policy to the deployed scheduler only while the faster native preventive layer
 * remains active. A human-managed policy, an unsupported cron expression, or a looser-than-reviewed
 * host cadence is never overwritten automatically.
 */
export async function reconcileObservationPolicy(db: any): Promise<ObservationPolicyRecoveryResult> {
  const cadence = selfHealingHostCadence()
  const deep = cadence.vercelObservation
  const native = cadence.nativeProactiveMonitoring
  if (!deep || !native) throw new Error('trusted host scheduler cadence is unavailable')

  // This playbook was reviewed for the current cost-aware architecture only: native detection no
  // slower than 30m, deep Vercel observation no slower than 2h. A future wider schedule requires a
  // new review instead of silently inheriting this authorization.
  if (native.maximumIntervalSeconds > 30 * 60) throw new Error('native preventive monitoring is slower than the pre-authorized 30 minute ceiling')
  if (deep.maximumIntervalSeconds > 2 * 60 * 60) throw new Error('Vercel observation is slower than the pre-authorized 2 hour ceiling')
  if (deep.maximumIntervalSeconds < 60) throw new Error('Vercel observation cadence is outside the policy floor')

  const table = db.from('supervisor_observation_policy')
  const { data: current, error: readError } = await table
    .select('instance_id,environment,interval_seconds,staleness_multiplier,missed_run_is_incident,enabled,rationale,updated_by,updated_at')
    .eq('instance_id', OBSERVATION_POLICY_INSTANCE_ID)
    .eq('environment', OBSERVATION_POLICY_ENVIRONMENT)
    .maybeSingle()
  if (readError || !current) throw new Error(`observation policy read failed: ${readError?.message || 'row missing'}`)
  if (!managedBySystem(current.updated_by)) throw new Error('observation policy is operator-managed and requires approval')

  const previousIntervalSeconds = Number(current.interval_seconds)
  const desiredIntervalSeconds = deep.maximumIntervalSeconds
  if (previousIntervalSeconds === desiredIntervalSeconds) {
    return {
      changed: false,
      policyInstanceId: OBSERVATION_POLICY_INSTANCE_ID,
      previousIntervalSeconds,
      currentIntervalSeconds: desiredIntervalSeconds,
      schedulerSchedule: deep.schedule,
      nativeMonitoringIntervalSeconds: native.maximumIntervalSeconds,
      verified: true,
    }
  }

  const now = new Date().toISOString()
  const rationale = [
    `Deep Vercel observation follows the deployed host scheduler (${deep.schedule}; maximum interval ${desiredIntervalSeconds}s).`,
    `Native proactive monitoring remains the faster preventive layer at a maximum interval of ${native.maximumIntervalSeconds}s.`,
    'Reconciled automatically after the Supervisor detected scheduler/policy configuration drift.',
  ].join(' ')

  // Optimistic concurrency: if somebody changed the row after our read, do nothing and require a
  // later investigation rather than overwriting their decision.
  const { data: updated, error: updateError } = await db.from('supervisor_observation_policy')
    .update({ interval_seconds: desiredIntervalSeconds, rationale, updated_by: OBSERVATION_POLICY_RECOVERY_ACTOR, updated_at: now })
    .eq('instance_id', OBSERVATION_POLICY_INSTANCE_ID)
    .eq('environment', OBSERVATION_POLICY_ENVIRONMENT)
    .eq('updated_at', current.updated_at)
    .select('instance_id,environment,interval_seconds,rationale,updated_by,updated_at')
    .maybeSingle()
  if (updateError || !updated) throw new Error(`observation policy reconciliation was not applied: ${updateError?.message || 'concurrent change'}`)

  const { data: verified, error: verifyError } = await db.from('supervisor_observation_policy')
    .select('interval_seconds,updated_by,updated_at')
    .eq('instance_id', OBSERVATION_POLICY_INSTANCE_ID)
    .eq('environment', OBSERVATION_POLICY_ENVIRONMENT)
    .maybeSingle()
  const verifiedOk = !verifyError
    && Number(verified?.interval_seconds) === desiredIntervalSeconds
    && String(verified?.updated_by || '') === OBSERVATION_POLICY_RECOVERY_ACTOR

  if (!verifiedOk) {
    // Roll back only if our own write is still the latest row. Never overwrite a concurrent human
    // edit while trying to compensate for our verification failure.
    await db.from('supervisor_observation_policy')
      .update({
        interval_seconds: previousIntervalSeconds,
        rationale: current.rationale ?? null,
        updated_by: current.updated_by ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('instance_id', OBSERVATION_POLICY_INSTANCE_ID)
      .eq('environment', OBSERVATION_POLICY_ENVIRONMENT)
      .eq('updated_at', updated.updated_at)
    throw new Error(`observation policy verification failed${verifyError?.message ? `: ${verifyError.message}` : ''}; rollback attempted`)
  }

  return {
    changed: true,
    policyInstanceId: OBSERVATION_POLICY_INSTANCE_ID,
    previousIntervalSeconds,
    currentIntervalSeconds: desiredIntervalSeconds,
    schedulerSchedule: deep.schedule,
    nativeMonitoringIntervalSeconds: native.maximumIntervalSeconds,
    verified: true,
  }
}

export function createObservationPolicyRecoveryExecutor(options: {
  reconcile: () => Promise<ObservationPolicyRecoveryResult>
  id?: string
}): ChainExecutor {
  return {
    id: options.id ?? 'observation-policy-recovery',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      if (request.action.kind !== OBSERVATION_POLICY_RECONCILE_KIND) return { handled: false, reason: 'not a supervisor repair action' }
      if (request.action.target !== OBSERVATION_POLICY_RECONCILE_TARGET) return { handled: false, reason: 'no observation-policy recovery mapping' }
      try {
        const result = await options.reconcile()
        return { handled: true, ok: true, result }
      } catch (error) {
        return { handled: true, ok: false, error: error instanceof Error ? error.message : 'observation policy recovery failed' }
      }
    },
  }
}
