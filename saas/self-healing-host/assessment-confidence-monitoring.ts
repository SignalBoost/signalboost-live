import { createHash } from 'node:crypto'
import { assessObservationConfidence, type ConfidenceReason } from '@/lib/supervisor/operational-assessment'
import { listObservationPolicies, observationTiming } from '@/lib/supervisor/observation-policy'
import { SupabaseVercelHealthStore } from '@/lib/supervisor/providers/vercel'
import { incidentSchema, type SupervisorIncident } from '@/lib/supervisor/incident-schema'
import {
  CONFIDENCE_INVESTIGATION_TARGET,
  PERSISTENCE_EVIDENCE_MAX_AGE_MS,
  PERSISTENCE_PROBE_ID,
  PERSISTENCE_PROBE_TARGET,
} from './native-persistence-monitoring'

const DEFAULT_COOLDOWN_SECONDS = 6 * 60 * 60

function fingerprint(confidence: number, reasons: readonly ConfidenceReason[]): string {
  return createHash('sha256').update(JSON.stringify({ confidence, reasons: reasons.map(r => [r.code, r.penalty, r.label]) })).digest('hex')
}

export function buildAssessmentConfidenceIncident(input: {
  confidence: number
  reasons: ConfidenceReason[]
  detectedAt: string
  fingerprint: string
}): SupervisorIncident {
  const severity = input.confidence < 60 ? 'critical' : 'warning'
  return incidentSchema.parse({
    incidentId: `assessment-confidence-${input.fingerprint.slice(0, 20)}`,
    provider: 'signalboost-supervisor',
    environment: 'production',
    severity,
    detectedAt: input.detectedAt,
    source: 'cron',
    errorCode: 'supervisor_observation_confidence_gap',
    errorMessage: `Supervisor observation confidence is ${input.confidence}% instead of 100%.`,
    affectedResource: 'supervisor-observation-evidence',
    evidence: input.reasons.map((reason, index) => ({
      evidenceId: `confidence-${input.fingerprint.slice(0, 12)}-${index + 1}`,
      type: 'observation_confidence_deduction',
      capturedAt: input.detectedAt,
      summary: `-${reason.penalty}: ${reason.label}. ${reason.why} Restored by: ${reason.remedy}`.slice(0, 1000),
      reference: reason.code,
    })),
    metadata: {
      monitoringMode: 'native',
      observationOnly: true,
      nativeProbe: 'assessment-confidence',
      confidence: input.confidence,
      confidenceFingerprint: input.fingerprint,
      reasonCodes: input.reasons.map(reason => reason.code),
    },
  })
}

async function persistenceMeasured(db: any, since: string): Promise<boolean> {
  const { data, error } = await db.from('self_healing_native_probe_samples')
    .select('observed_at,status,details')
    .eq('probe_id', PERSISTENCE_PROBE_ID)
    .eq('target', PERSISTENCE_PROBE_TARGET)
    .gte('observed_at', since)
    .order('observed_at', { ascending: false })
    .limit(12)
  if (error || !Array.isArray(data)) return false
  return data.some((row: any) => row.status === 'healthy' && row.details?.verification === 'read_back_verified')
}

/**
 * Durable cost-control marker using the already-deployed native-probe table. Correctness never
 * depends on this marker: a rare concurrent duplicate can only cause duplicate investigation;
 * execution remains independently governed by the Agent Gateway/MCP policy boundary.
 */
async function claimConfidenceInvestigation(db: any, input: {
  fingerprint: string
  confidence: number
  reasonCodes: string[]
  now: Date
  cooldownSeconds: number
}): Promise<boolean> {
  const since = new Date(input.now.getTime() - Math.max(300, input.cooldownSeconds) * 1000).toISOString()
  const { data: recent, error: readError } = await db.from('self_healing_native_probe_samples')
    .select('observed_at,details')
    .eq('probe_id', PERSISTENCE_PROBE_ID)
    .eq('target', CONFIDENCE_INVESTIGATION_TARGET)
    .gte('observed_at', since)
    .order('observed_at', { ascending: false })
    .limit(24)
  if (readError) return false
  if ((recent ?? []).some((row: any) => row.details?.fingerprint === input.fingerprint)) return false

  const { error: insertError } = await db.from('self_healing_native_probe_samples').insert({
    probe_id: PERSISTENCE_PROBE_ID,
    target: CONFIDENCE_INVESTIGATION_TARGET,
    observed_at: input.now.toISOString(),
    status: 'healthy',
    latency_ms: null,
    error_rate: 0,
    metric_value: input.confidence,
    metric_unit: 'observation_confidence_pct',
    details: {
      probeKind: 'confidence_investigation_claim',
      fingerprint: input.fingerprint,
      reasonCodes: input.reasonCodes,
    },
  })
  return !insertError
}

/**
 * Converts the confidence ledger into an actual preventive condition. An unchanged finding is
 * durably suppressed for the cooldown; changed evidence gets a new fingerprint and is eligible
 * immediately. If the durable claim cannot be stored, fail closed to no COS call rather than
 * repeatedly spending model/runtime cost on an untrackable investigation.
 */
export async function collectAssessmentConfidenceIncident(db: any, options: { cooldownSeconds?: number; now?: () => Date } = {}): Promise<SupervisorIncident | null> {
  const now = options.now ?? (() => new Date())
  const at = now()
  const runs = await new SupabaseVercelHealthStore(db).listRuns({ limit: 50 }).catch(() => [])
  const successful = runs.filter(r => ['healthy', 'incident_detected'].includes(r.status) && ['verified', 'partially_verified'].includes(r.verification.status))
  const verificationFailed = runs.filter(r => ['failed', 'rejected', 'unverifiable'].includes(r.verification.status)).length
  const auditGaps = runs.filter(r => !(r.auditEvents || []).some(e => e.eventType.includes('workflow_completed') || e.eventType.includes('workflow_failed') || e.eventType.includes('workflow_rejected'))).length

  const policies = (await listObservationPolicies(db).catch(() => [])).filter(policy => policy.enabled)
  const lastObservationAt = runs[0]?.completedAt || null
  const missedWindows = policies.filter(policy => observationTiming(policy, lastObservationAt).windowMissed).length

  const { data: instances } = await db.from('supervisor_instances').select('instance_id,runtime_id,status,heartbeat_at').limit(100)
  const activeInstances = (instances ?? []).filter((item: any) => ['starting', 'healthy', 'draining'].includes(String(item.status)))
  const unverifiableLiveness = activeInstances
    .filter((item: any) => !policies.some(policy => policy.instanceId === String(item.instance_id || '')) && !item.heartbeat_at)
    .map((item: any) => String(item.instance_id || item.runtime_id || '?'))

  const persistenceSince = new Date(at.getTime() - PERSISTENCE_EVIDENCE_MAX_AGE_MS).toISOString()
  const hasPersistenceEvidence = await persistenceMeasured(db, persistenceSince)

  const { confidence, reasons } = assessObservationConfidence({
    observationsExpected: successful.length + missedWindows,
    observationsCompleted: successful.length,
    unverifiableLiveness,
    unmeasuredDomains: hasPersistenceEvidence ? [] : ['persistence'],
    verificationAttempted: runs.length,
    verificationFailed,
    auditGaps,
  })
  if (confidence >= 100 || reasons.length === 0) return null

  const fp = fingerprint(confidence, reasons)
  const claimed = await claimConfidenceInvestigation(db, {
    fingerprint: fp,
    confidence,
    reasonCodes: reasons.map(reason => reason.code),
    now: at,
    cooldownSeconds: options.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS,
  })
  if (!claimed) return null
  return buildAssessmentConfidenceIncident({ confidence, reasons, detectedAt: at.toISOString(), fingerprint: fp })
}
