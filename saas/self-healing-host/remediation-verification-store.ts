import { infraAdminClient } from '@/lib/infra-pr/client'
import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'

export interface RemediationClaim {
  recoveryKey: string
  automaticAttempts: number
  verificationStatus: 'pending' | 'verified' | 'failed'
}

export function remediationRecoveryKey(incident: SupervisorIncident): string {
  const provider = (incident.provider || 'unknown').toLowerCase()
  const environment = (incident.environment || 'production').toLowerCase()
  const errorCode = (incident.errorCode || 'unknown').toLowerCase()
  const resource = (incident.affectedResource || incident.incidentId).toLowerCase()
  return [provider, environment, errorCode, resource].join(':').slice(0, 900)
}

/**
 * Atomically claims the single unattended repair attempt allowed for one stable
 * failed resource. A null return means another cycle already claimed it.
 */
export async function claimRoutineRemediation(incident: SupervisorIncident): Promise<RemediationClaim | null> {
  const admin = infraAdminClient()
  if (!admin.ok || !admin.client) {
    throw new Error(admin.error || 'Self-Healing remediation verification store unavailable')
  }

  const recoveryKey = remediationRecoveryKey(incident)
  const { data, error } = await admin.client.rpc('claim_self_healing_remediation_attempt', {
    p_recovery_key: recoveryKey,
    p_incident_id: incident.incidentId,
    p_provider: incident.provider || 'unknown',
    p_environment: incident.environment || 'production',
    p_error_code: incident.errorCode || null,
    p_affected_resource: incident.affectedResource || null,
    p_details: {
      source: 'native-proactive-monitoring',
      detectedAt: incident.detectedAt,
    },
  })
  if (error) throw new Error(`Unable to claim routine remediation: ${error.message}`)
  if (!data) return null

  return {
    recoveryKey,
    automaticAttempts: Number(data.automatic_attempts || 0),
    verificationStatus: data.verification_status,
  }
}
