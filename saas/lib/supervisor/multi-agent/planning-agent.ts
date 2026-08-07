import type { SupervisorIncident } from '../incident-schema.ts'
import { ReasoningEngine, type ReasoningEngineOptions } from '../reasoning/reasoning-engine.ts'
import type { CognitiveContext } from '../cognitive/types.ts'
import type { DiagnosisReport, PlanningAgentPort, ProposedPlan, ProposedStep } from './types.ts'

const toProposedStep = (step: ReturnType<ReasoningEngine['proposeRepairPlan']>['steps'][number], targetEnvironment: SupervisorIncident['environment']): ProposedStep => ({
  stepId: step.stepId,
  action: step.action,
  capabilityId: typeof step.parameters.actionId === 'string' ? step.parameters.actionId : undefined,
  targetResource: typeof step.parameters.resource === 'string'
    ? step.parameters.resource
    : typeof step.parameters.target === 'string'
      ? step.parameters.target
      : 'unknown',
  targetEnvironment,
  parameters: { ...step.parameters },
  justification: step.description,
  expectedResult: step.expectedResult,
  protectedAction: step.protectedAction,
})

export class PlanningAgent implements PlanningAgentPort {
  private readonly reasoning: ReasoningEngine

  constructor(options: ReasoningEngineOptions = {}) {
    this.reasoning = new ReasoningEngine(options)
  }

  propose(input: { incident: SupervisorIncident; context: CognitiveContext; diagnosis: DiagnosisReport }): ProposedPlan {
    const incident: SupervisorIncident = {
      ...input.incident,
      metadata: {
        ...input.incident.metadata,
        diagnosisId: input.diagnosis.diagnosisId,
        diagnosisSummary: input.diagnosis.summary,
        diagnosisConfidence: input.diagnosis.confidenceScore,
      },
    }
    const plan = this.reasoning.proposeRepairPlan(incident)
    return {
      planId: plan.planId,
      diagnosisId: input.diagnosis.diagnosisId,
      incidentId: plan.incidentId,
      targetProvider: plan.targetProvider,
      targetEnvironment: plan.targetEnvironment,
      targetOrigin: plan.targetOrigin,
      diagnosis: plan.diagnosis,
      confidenceScore: Math.min(plan.confidenceScore, input.diagnosis.confidenceScore),
      steps: plan.steps.map(step => toProposedStep(step, plan.targetEnvironment)),
      verificationSteps: plan.verificationSteps.map(step => toProposedStep(step, plan.targetEnvironment)),
      rollbackSteps: (plan.rollbackSteps ?? []).map(step => toProposedStep(step, plan.targetEnvironment)),
      generatedAt: plan.generatedAt,
    }
  }
}
