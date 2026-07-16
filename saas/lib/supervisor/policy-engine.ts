import type { PolicyContext, PolicyDecision, PolicyEngine, SupervisorMode } from './execution-contracts.ts'
import type { SupervisorIncident } from './incident-schema.ts'
import type { RepairPlan, RepairStep } from './repair-plan-schema.ts'

const POLICY_VERSION = 'supervisor-core-v1'
const modifyingActions = new Set(['api_request', 'navigate', 'click', 'fill', 'select'])
const readOnlyActions = new Set(['read', 'screenshot', 'verify', 'stop'])
const destructivePattern = /delete|destroy|remove|drop|terminate|disable|purge|wipe|revoke/i
const sensitivePattern = /billing|payment|ownership|owner|permission|domain.transfer|transfer domain|secret rotation|rotate secret|rotate token|rotate key|api key|private key/i

function now(): string { return new Date().toISOString() }
function decision(outcome: PolicyDecision['outcome'], reason: string, approvedStepIds: string[] = []): PolicyDecision {
  return { outcome, reason, evaluatedAt: now(), policyVersion: POLICY_VERSION, approvedStepIds }
}
function isReadOnly(step: RepairStep, context: PolicyContext): boolean {
  return readOnlyActions.has(step.action) || Boolean(context.readOnlyStepIds?.includes(step.stepId))
}
function isReversible(step: RepairStep, context: PolicyContext): boolean {
  return Boolean(context.reversibleStepIds?.includes(step.stepId) || (step.parameters as Record<string, unknown>).reversible === true)
}
function hasModification(plan: RepairPlan): boolean { return plan.steps.some(step => modifyingActions.has(step.action) && !readOnlyActions.has(step.action)) }
function hasDestructive(plan: RepairPlan): boolean { return plan.steps.some(step => destructivePattern.test(`${step.action} ${step.description} ${JSON.stringify(step.parameters)}`)) }
function hasSensitive(plan: RepairPlan): boolean { return plan.steps.some(step => sensitivePattern.test(`${step.description} ${JSON.stringify(step.parameters)}`)) }
function approvedReadOnlyIds(plan: RepairPlan, context: PolicyContext): string[] { return plan.steps.filter(step => isReadOnly(step, context)).map(step => step.stepId) }

export class DefaultSupervisorPolicyEngine implements PolicyEngine {
  evaluate({ plan, mode, context }: { incident: SupervisorIncident; plan: RepairPlan; mode: SupervisorMode; context: PolicyContext }): PolicyDecision {
    if (mode === 'disabled') return decision('blocked', 'Supervisor mode is disabled.')
    if (hasDestructive(plan)) return decision('blocked', 'Destructive operations are not permitted by the default policy.')
    if (mode === 'passive') {
      if (plan.steps.some(step => step.protectedAction)) return decision('approval_required', 'Protected actions require approval in passive mode.')
      if (plan.riskLevel !== 'low') return decision('approval_required', 'Medium or higher risk plans require approval in passive mode.')
      if (plan.targetEnvironment === 'production' && hasModification(plan)) return decision('approval_required', 'Production modifications require approval.')
      if (plan.steps.every(step => isReadOnly(step, context))) return decision('approved', 'Read-only passive plan approved.', approvedReadOnlyIds(plan, context))
      return decision('approval_required', 'Ambiguous passive plan requires approval.')
    }
    if (plan.riskLevel === 'critical') return decision('blocked', 'Critical-risk plans are blocked in autopilot mode.')
    if (hasSensitive(plan)) return decision('approval_required', 'Sensitive billing, ownership, permission, domain, or secret operations require approval.')
    if (plan.targetEnvironment === 'production' && hasModification(plan)) return decision('approval_required', 'Production modifications require approval.')
    if (plan.steps.every(step => isReadOnly(step, context))) return decision('approved', 'Read-only autopilot plan approved.', approvedReadOnlyIds(plan, context))
    if (plan.riskLevel === 'low' && plan.targetEnvironment === 'sandbox' && plan.steps.every(step => isReadOnly(step, context) || isReversible(step, context))) {
      return decision('approved', 'Low-risk reversible sandbox plan approved.', plan.steps.map(step => step.stepId))
    }
    if (plan.targetEnvironment === 'preview' && plan.riskLevel === 'low' && plan.steps.every(step => isReadOnly(step, context) || isReversible(step, context))) {
      return decision('approval_required', 'Preview modifications are conservative and require approval unless separately authorized.')
    }
    return decision('approval_required', 'Ambiguous autopilot plan requires approval.')
  }
}
