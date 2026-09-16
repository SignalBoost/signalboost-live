import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import type { DiagnosticResult } from '../lib/autonomous-supervisor/types.ts'
import type { RepairActionResolver } from '../agent-gateway-host/supervisor-repair.ts'
import { resolveSupervisorRepairAction } from '../agent-gateway-host/supervisor-actions.ts'
import {
  OBSERVATION_POLICY_DRIFT_ERROR_CODE,
  OBSERVATION_POLICY_RECONCILE_TARGET,
} from '../agent-gateway-host/observation-policy-recovery.ts'
import {
  UNIVERSITY_DISTILLATION_HEALTH_ERROR_CODE,
  UNIVERSITY_DISTILLATION_RECOVERY_TARGET,
} from './university-distillation-monitoring.ts'

const DRIFT_REPAIR_WORDS = /\b(observation|scheduler|schedule|cadence|interval|policy|configuration|config)\b/i
const DISTILLATION_REPAIR_WORDS = /\b(university|distillation|campaign|training|provider|heartbeat|retry|recover|workflow)\b/i

function trustedUniversityDistillationRecovery(incident: SupervisorIncident): boolean {
  return incident.errorCode === UNIVERSITY_DISTILLATION_HEALTH_ERROR_CODE
    && incident.metadata?.nativeProbe === 'cos-university-mass-distillation'
    && incident.metadata?.registeredRecoveryAction === UNIVERSITY_DISTILLATION_RECOVERY_TARGET
    && incident.metadata?.recoveryPreauthorized === true
    && incident.metadata?.authorityExpanded === false
    && incident.metadata?.automaticPromotionAuthorized === false
    && incident.metadata?.runpodMutationAuthorized === false
}

/**
 * Deterministic health rules are also a deterministic diagnosis. Keeping this exact host-owned
 * diagnosis independent of model availability prevents a known, pre-authorized recovery from
 * degrading into alert-only behavior when no diagnostic model is already running. Free-form or
 * untrusted incidents still use the normal COS diagnostic path and its approval defaults.
 */
export function diagnoseRegisteredNativeRecovery(incident: SupervisorIncident): DiagnosticResult | null {
  if (!trustedUniversityDistillationRecovery(incident)) return null
  const healthReasons = Array.isArray(incident.metadata?.healthReasons)
    ? incident.metadata.healthReasons.map(value => String(value)).slice(0, 8)
    : []
  return {
    incident_id: incident.incidentId,
    incident_summary: 'The COS University mass-distillation control loop stopped satisfying its durable continuity contract.',
    diagnosis: `The native monitor observed ${healthReasons.join(', ') || 'an unhealthy workflow state'} while a bounded registered recovery remains authorized by either the existing campaign envelope or the owner-approved rolling 24-hour policy.`,
    confidence_score: 100,
    confidence_reason: 'The diagnosis comes from exact host-owned database, heartbeat, and provider-ledger predicates rather than inferred model prose.',
    evidence: incident.evidence.map(item => ({ source: item.type, finding: item.summary })),
    missing_information: [],
    recommended_execution_method: 'api',
    requires_ui_agent: false,
    requires_human_approval: false,
    risk_level: 'medium',
    risk_reasons: [
      'The workflow may retry only inside an existing campaign or authorize one prepared batch inside the owner-approved rolling 24-hour maximum-authority ceiling.',
      'The repair cannot promote a model, alter RunPod, extend expiry, or increase budget.',
    ],
    repair_plan: [{
      step: 1,
      action: 'Run the registered bounded COS University mass-distillation recovery workflow.',
      executor: 'api_executor',
      target: 'COS University mass-distillation workflow',
      expected_result: 'A fresh durable Production receipt reports success and a separate health read no longer requires repair.',
      requires_approval: false,
    }],
    verification_plan: [{
      step: 1,
      check: 'Read the durable Production receipt, campaign state, failed runs, and unsettled provider-job ledger again after recovery.',
      success_condition: 'The recovery invocation succeeded and the independent health snapshot no longer requires repair.',
    }],
    rollback_plan: [{
      step: 1,
      action: 'Stop later retry ticks and preserve the existing campaign, provider, and cost ledgers without widening authority.',
    }],
    escalation_reason: null,
  }
}

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
    const trustedDistillation = trustedUniversityDistillationRecovery(incident)
      && step.executor === 'api_executor'
      && DISTILLATION_REPAIR_WORDS.test(`${step.action} ${step.target} ${step.expected_result}`)
    if (trustedDistillation) return UNIVERSITY_DISTILLATION_RECOVERY_TARGET
    return resolveSupervisorRepairAction(step, normalizedIncident)
  }
}
