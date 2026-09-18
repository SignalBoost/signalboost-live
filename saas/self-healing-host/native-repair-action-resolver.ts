import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'
import type { RepairActionResolver } from '@/agent-gateway-host/supervisor-repair'
import { resolveSupervisorRepairAction } from '@/agent-gateway-host/supervisor-actions'
import {
  OBSERVATION_POLICY_DRIFT_ERROR_CODE,
  OBSERVATION_POLICY_RECONCILE_TARGET,
} from '@/agent-gateway-host/observation-policy-recovery'

const DRIFT_REPAIR_WORDS = /\b(observation|scheduler|schedule|cadence|interval|policy|configuration|config)\b/i

/**
 * Add trusted incident context to the otherwise prose-only repair resolver. Model text can select
 * nothing by itself: the automatic target is reachable only when the host-created incident names
 * this exact registered recovery and marks it pre-authorized.
 */
export function createNativeRepairActionResolver(incident: SupervisorIncident): RepairActionResolver {
  return (step, normalizedIncident) => {
    const trustedDrift = incident.errorCode === OBSERVATION_POLICY_DRIFT_ERROR_CODE
      && incident.metadata?.registeredRecoveryAction === OBSERVATION_POLICY_RECONCILE_TARGET
      && incident.metadata?.recoveryPreauthorized === true
      && step.executor === 'api_executor'
      && DRIFT_REPAIR_WORDS.test(`${step.action} ${step.target} ${step.expected_result}`)
    if (trustedDrift) return OBSERVATION_POLICY_RECONCILE_TARGET
    return resolveSupervisorRepairAction(step, normalizedIncident)
  }
}
