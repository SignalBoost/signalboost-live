import { createHash } from 'node:crypto'
import { listObservationPolicies } from '@/lib/supervisor/observation-policy'
import { incidentSchema, type SupervisorIncident } from '@/lib/supervisor/incident-schema'
import { PERSISTENCE_PROBE_ID } from './native-persistence-monitoring'
import { selfHealingHostCadence } from './host-scheduler'
import { OBSERVATION_POLICY_DRIFT_ERROR_CODE, OBSERVATION_POLICY_ENVIRONMENT, OBSERVATION_POLICY_INSTANCE_ID, OBSERVATION_POLICY_RECONCILE_TARGET } from '@/agent-gateway-host/observation-policy-recovery'

const CLAIM_TARGET = 'self-healing:configuration-drift-investigation'
const COOLDOWN_SECONDS = 6 * 60 * 60
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const systemManaged = (value: unknown) => ['', 'system', 'cos-self-healing'].includes(String(value ?? '').trim())

async function claim(db: any, fingerprint: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - COOLDOWN_SECONDS * 1000).toISOString()
  const { data, error } = await db.from('self_healing_native_probe_samples').select('details')
    .eq('probe_id', PERSISTENCE_PROBE_ID).eq('target', CLAIM_TARGET).gte('observed_at', since).limit(24)
  if (error || (data ?? []).some((row: any) => row.details?.fingerprint === fingerprint)) return false
  const { error: insertError } = await db.from('self_healing_native_probe_samples').insert({
    probe_id: PERSISTENCE_PROBE_ID, target: CLAIM_TARGET, observed_at: now.toISOString(), status: 'healthy',
    error_rate: 0, metric_value: 1, metric_unit: 'configuration_drift_finding',
    details: { probeKind: 'configuration_drift_investigation_claim', fingerprint },
  })
  return !insertError
}

export function buildObservationSchedulePolicyDriftIncident(input: {
  detectedAt: string; fingerprint: string; policyIntervalSeconds: number; scheduledIntervalSeconds: number;
  schedulerSchedule: string; nativeMonitoringIntervalSeconds: number | null; nativeMonitoringSchedule: string | null;
  policyUpdatedBy: string;
}): SupervisorIncident {
  const preauthorized = systemManaged(input.policyUpdatedBy) && input.scheduledIntervalSeconds <= 7200
    && input.nativeMonitoringIntervalSeconds != null && input.nativeMonitoringIntervalSeconds <= 1800
  return incidentSchema.parse({
    incidentId: `observation-policy-drift-${input.fingerprint.slice(0, 20)}`,
    provider: 'signalboost-supervisor', environment: OBSERVATION_POLICY_ENVIRONMENT, severity: 'warning',
    detectedAt: input.detectedAt, source: 'cron', errorCode: OBSERVATION_POLICY_DRIFT_ERROR_CODE,
    errorMessage: `Declared observation policy is ${input.policyIntervalSeconds}s but the deployed scheduler ticks every ${input.scheduledIntervalSeconds}s.`,
    affectedResource: OBSERVATION_POLICY_INSTANCE_ID,
    evidence: [
      { evidenceId: `drift-${input.fingerprint.slice(0, 10)}-1`, type: 'declared_policy', capturedAt: input.detectedAt, summary: `${OBSERVATION_POLICY_INSTANCE_ID} requires ${input.policyIntervalSeconds}s.`, reference: OBSERVATION_POLICY_INSTANCE_ID },
      { evidenceId: `drift-${input.fingerprint.slice(0, 10)}-2`, type: 'host_scheduler', capturedAt: input.detectedAt, summary: `Vercel cron '${input.schedulerSchedule}' has maximum interval ${input.scheduledIntervalSeconds}s.`, reference: '/api/cron/vercel-observation' },
      { evidenceId: `drift-${input.fingerprint.slice(0, 10)}-3`, type: 'native_prevention', capturedAt: input.detectedAt, summary: input.nativeMonitoringIntervalSeconds == null ? 'Native preventive cadence is unavailable.' : `Native proactive monitoring remains at ${input.nativeMonitoringIntervalSeconds}s (${input.nativeMonitoringSchedule}).`, reference: '/api/cron/native-proactive-monitoring' },
    ],
    metadata: {
      monitoringMode: 'native', nativeProbe: 'configuration-drift', policyInstanceId: OBSERVATION_POLICY_INSTANCE_ID,
      policyIntervalSeconds: input.policyIntervalSeconds, scheduledIntervalSeconds: input.scheduledIntervalSeconds,
      schedulerSchedule: input.schedulerSchedule, nativeMonitoringIntervalSeconds: input.nativeMonitoringIntervalSeconds,
      policyUpdatedBy: input.policyUpdatedBy, registeredRecoveryAction: OBSERVATION_POLICY_RECONCILE_TARGET,
      recoveryPreauthorized: preauthorized, configurationFingerprint: input.fingerprint,
    },
  })
}

/** Configuration drift is a preventive condition even when the displayed confidence is 100%. */
export async function collectConfigurationDriftIncident(db: any): Promise<SupervisorIncident | null> {
  const policies = (await listObservationPolicies(db).catch(() => [])).filter(policy => policy.enabled)
  const policy = policies.find(item => item.instanceId === OBSERVATION_POLICY_INSTANCE_ID && item.environment === OBSERVATION_POLICY_ENVIRONMENT)
  const cadence = selfHealingHostCadence(); const scheduled = cadence.vercelObservation
  if (!policy || !scheduled || policy.intervalSeconds === scheduled.maximumIntervalSeconds) return null

  const { data: ownership, error: ownershipError } = await db.from('supervisor_observation_policy').select('updated_by')
    .eq('instance_id', OBSERVATION_POLICY_INSTANCE_ID).eq('environment', OBSERVATION_POLICY_ENVIRONMENT).maybeSingle()
  // Unverified ownership is explicitly non-authorizing. A real row with NULL updated_by remains a
  // system/default row, but a failed or missing read becomes the sentinel below and cannot execute.
  const policyUpdatedBy = ownershipError || !ownership ? 'unverified' : String(ownership.updated_by ?? '')
  const native = cadence.nativeProactiveMonitoring
  const fingerprint = hash({ policy: policy.intervalSeconds, schedule: scheduled.schedule, scheduled: scheduled.maximumIntervalSeconds, native: native?.maximumIntervalSeconds ?? null, policyUpdatedBy })
  const now = new Date()
  if (!await claim(db, fingerprint, now)) return null
  return buildObservationSchedulePolicyDriftIncident({
    detectedAt: now.toISOString(), fingerprint, policyIntervalSeconds: policy.intervalSeconds,
    scheduledIntervalSeconds: scheduled.maximumIntervalSeconds, schedulerSchedule: scheduled.schedule,
    nativeMonitoringIntervalSeconds: native?.maximumIntervalSeconds ?? null,
    nativeMonitoringSchedule: native?.schedule ?? null, policyUpdatedBy,
  })
}
