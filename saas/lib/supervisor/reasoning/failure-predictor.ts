import type { RepairStep } from '../repair-plan-schema.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { FailurePrediction, RewrittenTask } from './types.ts'

const mutatingActions = new Set<RepairStep['action']>(['api_request', 'navigate', 'click', 'fill', 'select'])

function riskRank(level: FailurePrediction['overallRiskLevel']): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[level]
}

function maxRisk(a: FailurePrediction['overallRiskLevel'], b: FailurePrediction['overallRiskLevel']): FailurePrediction['overallRiskLevel'] {
  return riskRank(a) >= riskRank(b) ? a : b
}

export class FailurePredictor {
  predict(input: { incident: SupervisorIncident; task: RewrittenTask; steps: RepairStep[] }): FailurePrediction {
    const hasMutation = input.steps.some(step => mutatingActions.has(step.action))
    const requiresBrowser = input.steps.some(step => ['navigate', 'click', 'fill', 'select', 'screenshot'].includes(step.action))

    let overallRiskLevel: FailurePrediction['overallRiskLevel'] = hasMutation ? 'medium' : 'low'
    if (hasMutation && input.task.environment === 'production') overallRiskLevel = maxRisk(overallRiskLevel, 'high')
    if (hasMutation && input.incident.severity === 'critical') overallRiskLevel = maxRisk(overallRiskLevel, 'high')
    if (input.steps.some(step => step.protectedAction) && input.task.environment === 'production') overallRiskLevel = maxRisk(overallRiskLevel, 'high')

    const failureModes: string[] = []
    if (hasMutation) {
      failureModes.push('Remediation may not correct the diagnosed failure')
      failureModes.push('Remediation may regress an adjacent dependency')
      failureModes.push('Concurrent state change may invalidate the planned mutation')
    }
    if (requiresBrowser) failureModes.push('Browser state or selector drift may make the action non-repeatable')
    if (input.task.environment === 'production' && hasMutation) failureModes.push('Production mutation may expand impact beyond the initially affected resource')

    return {
      overallRiskLevel,
      blastRadius: hasMutation ? (input.task.environment === 'production' ? 'environment' : 'service') : 'local',
      failureModes,
      hasMutation,
      requiresBrowser,
      requiresHumanAttention: hasMutation && input.task.environment === 'production',
    }
  }
}
