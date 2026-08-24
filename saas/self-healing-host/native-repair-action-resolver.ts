import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'
import type { RepairActionResolver } from '@/agent-gateway-host/supervisor-repair'
import { resolveSupervisorRepairAction } from '@/agent-gateway-host/supervisor-actions'
import {
  OBSERVATION_POLICY_DRIFT_ERROR_CODE,
  OBSERVATION_POLICY_RECONCILE_TARGET,
} from '@/agent-gateway-host/observation-policy-recovery'
import {
  COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE,
  COS_QUALITY_RECOVERY_TARGET,
  COS_QUALITY_REGRESSION_ERROR_CODE,
} from '@/agent-gateway-host/cos-quality-recovery'

const DRIFT_REPAIR_WORDS = /\b(observation|scheduler|schedule|cadence|interval|policy|configuration|config)\b/i
const QUALITY_REPAIR_WORDS = /\b(benchmark|quality|autopsy|retest|reasoning|evidence|lesson|skill|regression)\b/i

/**
 * Add trusted incident context to the otherwise prose-only repair resolver. Model text can select
 * nothing by itself: an automatic target is reachable only when the host-created incident names
 * that exact registered recovery and marks it pre-authorized.
 */
export function createNativeRepairActionResolver(incident: SupervisorIncident): RepairActionResolver {
  return (step, normalizedIncident) => {
    const trustedDrift = incident.errorCode === OBSERVATION_POLICY_DRIFT_ERROR_CODE
      && incident.metadata?.registeredRecoveryAction === OBSERVATION_POLICY_RECONCILE_TARGET
      && incident.metadata?.recoveryPreauthorized === true
      && step.executor === 'api_executor'
      && DRIFT_REPAIR_WORDS.test(`${step.action} ${step.target} ${step.expected_result}`)
    if (trustedDrift) return OBSERVATION_POLICY_RECONCILE_TARGET

    const trustedQuality = [COS_QUALITY_REGRESSION_ERROR_CODE, COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE].includes(String(incident.errorCode || ''))
      && incident.metadata?.registeredRecoveryAction === COS_QUALITY_RECOVERY_TARGET
      && incident.metadata?.recoveryPreauthorized === true
      && step.executor === 'api_executor'
      && QUALITY_REPAIR_WORDS.test(`${step.action} ${step.target} ${step.expected_result}`)
    if (trustedQuality) return COS_QUALITY_RECOVERY_TARGET

    return resolveSupervisorRepairAction(step, normalizedIncident)
  }
}
