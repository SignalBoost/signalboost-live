import type { SupervisorIncident } from '../incident-schema.ts'
import type { CognitiveContext } from '../cognitive/types.ts'
import type { DiagnosisReport, ProposedPlan, SecurityAgentPort, SecurityAssessment, SecurityFinding } from './types.ts'

const mutatingActions = new Set(['api_request', 'navigate', 'click', 'fill', 'select'])

export class SecurityAgent implements SecurityAgentPort {
  review(input: { incident: SupervisorIncident; context: CognitiveContext; diagnosis: DiagnosisReport; plan: ProposedPlan; freezeWindow: boolean }): SecurityAssessment {
    const findings: SecurityFinding[] = []
    const mutating = input.plan.steps.filter(step => mutatingActions.has(step.action))
    const protectedSteps = input.plan.steps.filter(step => step.protectedAction)

    if (input.plan.incidentId !== input.incident.incidentId) {
      findings.push({ findingId: 'sec-incident-binding', severity: 'blocker', code: 'INCIDENT_BINDING_MISMATCH', message: 'Proposed plan is not bound to the current incident.', stepIds: [] })
    }
    if (input.plan.targetEnvironment !== input.incident.environment) {
      findings.push({ findingId: 'sec-environment-binding', severity: 'blocker', code: 'ENVIRONMENT_BINDING_MISMATCH', message: 'Proposed plan targets a different environment than the incident.', stepIds: input.plan.steps.map(step => step.stepId) })
    }
    if (mutating.length > 0 && input.plan.rollbackSteps.length === 0) {
      findings.push({ findingId: 'sec-no-rollback', severity: 'blocker', code: 'MUTATION_WITHOUT_ROLLBACK', message: 'Mutating proposal has no rollback steps.', stepIds: mutating.map(step => step.stepId) })
    }
    if (input.freezeWindow && mutating.length > 0) {
      findings.push({ findingId: 'sec-freeze-window', severity: 'warning', code: 'FREEZE_WINDOW_MUTATION', message: 'Mutation is proposed during a declared freeze window.', stepIds: mutating.map(step => step.stepId) })
    }
    if (protectedSteps.length > 0) {
      findings.push({ findingId: 'sec-protected-actions', severity: 'warning', code: 'PROTECTED_ACTIONS_PRESENT', message: 'The plan contains protected actions that require deterministic policy evaluation and approval.', stepIds: protectedSteps.map(step => step.stepId) })
    }
    if (input.plan.targetOrigin && input.plan.steps.some(step => ['navigate', 'click', 'fill', 'select'].includes(step.action))) {
      findings.push({ findingId: 'sec-browser-origin', severity: 'info', code: 'BROWSER_ORIGIN_BOUND', message: 'Browser actions are explicitly bound to a target origin.', stepIds: input.plan.steps.filter(step => ['navigate', 'click', 'fill', 'select'].includes(step.action)).map(step => step.stepId) })
    }

    const productionMutation = input.plan.targetEnvironment === 'production' && mutating.length > 0
    const riskAssessment: SecurityAssessment['riskAssessment'] = productionMutation
      ? 'high'
      : mutating.length > 0
        ? 'medium'
        : 'low'

    const recommendedApprovalsCount = input.freezeWindow && productionMutation ? 2 : productionMutation || protectedSteps.length > 0 ? 1 : 0
    const recommendedRoles = recommendedApprovalsCount === 2
      ? ['ON_CALL_LEAD', 'SECURITY_OFFICER']
      : recommendedApprovalsCount === 1
        ? ['ON_CALL_LEAD']
        : []

    return {
      assessmentId: `security-${input.plan.planId}`,
      planId: input.plan.planId,
      riskAssessment,
      findings,
      recommendedApprovalsCount,
      recommendedRoles,
      freezeWindow: input.freezeWindow,
      requiresHumanReview: recommendedApprovalsCount > 0 || findings.some(item => item.severity === 'blocker'),
    }
  }
}
