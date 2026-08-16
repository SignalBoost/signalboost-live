// Pure, strip-safe native incident normalization boundary.
// Keep this module dependency-free so deterministic Node acceptance can execute it
// without loading the full Next.js/Self-Healing runtime or its workspace aliases.

type NativeSeverity = 'info' | 'warning' | 'critical'
type SupervisorSeverity = 'LOW' | 'MEDIUM' | 'CRITICAL'

export interface NativeIncidentNormalizationInput {
  incidentId: string
  detectedAt: string
  provider: string
  severity: NativeSeverity
  errorCode?: string | null
  errorMessage: string
  affectedResource?: string | null
  evidence?: unknown
  metadata?: Record<string, unknown> | null
}

export interface NormalizedNativeIncident {
  incident_id: string
  timestamp: string
  provider: string
  project: string
  severity: SupervisorSeverity
  trigger: 'NATIVE_HEALTH'
  error_summary: string
  raw_logs: string
  context: {
    last_successful_deploy: null
    recent_env_changes: never[]
    affected_resource: string | null
    native_probe: string | null
    connector_evidence: unknown
  }
}

function severity(value: NativeSeverity): SupervisorSeverity {
  if (value === 'critical') return 'CRITICAL'
  if (value === 'warning') return 'MEDIUM'
  return 'LOW'
}

export function nativeIncidentToNormalized(
  incident: NativeIncidentNormalizationInput,
  connectorEvidence: unknown,
): NormalizedNativeIncident {
  const rawEvidence = { incidentEvidence: incident.evidence, metadata: incident.metadata, connectorEvidence }
  return {
    incident_id: incident.incidentId,
    timestamp: incident.detectedAt,
    provider: incident.provider,
    project: process.env.VERCEL_PROJECT_ID || 'signalboost-live',
    severity: severity(incident.severity),
    trigger: 'NATIVE_HEALTH',
    error_summary: `${incident.errorCode || 'native_health'}: ${incident.errorMessage}`.slice(0, 1200),
    raw_logs: JSON.stringify(rawEvidence).slice(0, 16_000),
    context: {
      last_successful_deploy: null,
      recent_env_changes: [],
      affected_resource: incident.affectedResource ?? null,
      native_probe: typeof incident.metadata?.nativeProbe === 'string' ? incident.metadata.nativeProbe : null,
      connector_evidence: connectorEvidence,
    },
  }
}
