import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'
import type { ApiCapabilityRegistry } from '../executors/api-capability-registry.ts'
import { emptyApiCapabilityRegistry } from '../executors/api-capability-registry.ts'
import type { CapabilityAdmission } from './types.ts'

const readOnlyActions = new Set<RepairStep['action']>(['read', 'verify', 'screenshot', 'stop'])
const browserActions = new Set<RepairStep['action']>(['navigate', 'click', 'fill', 'select'])
type Phase = CapabilityAdmission['phase']

export class CapabilityMatcher {
  private readonly apiRegistry: ApiCapabilityRegistry

  constructor(apiRegistry: ApiCapabilityRegistry = emptyApiCapabilityRegistry) {
    this.apiRegistry = apiRegistry
  }

  admit(plan: RepairPlan): CapabilityAdmission[] {
    const admissions: CapabilityAdmission[] = []
    for (const step of plan.steps) admissions.push(this.admitStep(step, plan, 'repair'))
    for (const step of plan.verificationSteps) admissions.push(this.admitStep(step, plan, 'verification'))
    for (const step of plan.rollbackSteps ?? []) admissions.push(this.admitStep(step, plan, 'rollback'))
    return admissions
  }

  assertPlanAdmissible(plan: RepairPlan): CapabilityAdmission[] {
    const admissions = this.admit(plan)
    for (const admission of admissions) {
      if (admission.executor === 'api' && !admission.known) {
        throw new Error(`Reasoning plan references an unregistered API capability at step ${admission.stepId}: ${admission.reason}`)
      }
      if (admission.phase === 'rollback' && admission.executor === 'api' && admission.riskClass !== 'routine_reversible') {
        throw new Error(`Rollback step ${admission.stepId} is not registered as routine_reversible`)
      }
      if (admission.phase === 'verification' && admission.approvalRequired) {
        throw new Error(`Verification step ${admission.stepId} is not admissible without additional authority`)
      }
    }
    return admissions
  }

  private admitStep(step: RepairStep, plan: RepairPlan, phase: Phase): CapabilityAdmission {
    if (readOnlyActions.has(step.action)) {
      return { stepId: step.stepId, phase, executor: 'read_only', known: true, autoExecutable: true, approvalRequired: false, riskClass: 'read_only', reason: 'Read-only step requires no mutating capability.' }
    }

    if (step.action === 'api_request') {
      const match = this.apiRegistry.match(step, plan.targetProvider)
      return {
        stepId: step.stepId,
        phase,
        executor: 'api',
        known: Boolean(match.capability),
        autoExecutable: match.allowed,
        approvalRequired: Boolean(match.capability?.approvalRequired || !match.allowed),
        ...(match.capability ? { riskClass: match.capability.riskClass } : {}),
        reason: match.reason,
      }
    }

    if (browserActions.has(step.action)) {
      return {
        stepId: step.stepId,
        phase,
        executor: 'browser',
        known: Boolean(plan.targetOrigin),
        autoExecutable: false,
        approvalRequired: true,
        reason: plan.targetOrigin
          ? 'Browser mutation is target-bound and remains subject to downstream browser policy and approval.'
          : 'Browser mutation has no target origin.',
      }
    }

    return { stepId: step.stepId, phase, executor: 'read_only', known: false, autoExecutable: false, approvalRequired: true, reason: `Unsupported step action ${step.action}.` }
  }
}
