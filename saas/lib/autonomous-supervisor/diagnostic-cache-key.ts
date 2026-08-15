export type SupervisorDiagnosticCacheIdentity = {
  incident_id: string
  timestamp: string
}

const DIAGNOSTIC_CACHE_PREFIX = 'cos-supervisor-diagnostic:v4:'

/**
 * Cache only one concrete detection attempt.
 *
 * The Supervisor's incident_id is intentionally a stable fingerprint and can recur later with new
 * evidence. The normalized incident timestamp is the detection-attempt identity (native detectedAt),
 * so same-attempt retries dedupe while a later recurrence cannot inherit a stale diagnosis.
 *
 * v4 intentionally invalidates the earlier v3 incident-id-only cache entries.
 */
export function supervisorDiagnosticCacheKey(incident: SupervisorDiagnosticCacheIdentity): string {
  const incidentId = String(incident?.incident_id ?? '').trim()
  const detectedAt = String(incident?.timestamp ?? '').trim()
  if (!incidentId) throw new Error('Supervisor diagnostic cache requires incident_id')
  if (!detectedAt) throw new Error('Supervisor diagnostic cache requires detection timestamp')
  return `${DIAGNOSTIC_CACHE_PREFIX}${incidentId}:${detectedAt}`
}
