import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import { repairPlanSchema, type RepairPlan, type RepairStep } from '../repair-plan-schema.ts'
import type { ApiCapabilityRegistry } from '../executors/api-capability-registry.ts'
import type { CognitiveEvidenceSource, CognitiveContext } from '../cognitive/types.ts'
import { EvidenceCollector } from '../cognitive/evidence-collector.ts'
import { ContextBuilder } from '../cognitive/context-builder.ts'
import { CapabilityMatcher } from '../cognitive/capability-matcher.ts'
import type { ReasoningEngineOptions } from '../reasoning/reasoning-engine.ts'
import { DiagnosisAgent } from './diagnosis-agent.ts'
import { DiagnosisValidator } from './diagnosis-validator.ts'
import { PlanningAgent } from './planning-agent.ts'
import { SecurityAgent } from './security-agent.ts'
import { immutablePayload } from './immutable.ts'
import type { DiagnosisAgentPort, MultiAgentSynthesis, PlanningAgentPort, ProposedStep, SecurityAgentPort } from './types.ts'

export interface MultiAgentEngineOptions extends ReasoningEngineOptions {
  evidenceSources?: readonly CognitiveEvidenceSource[]
  apiCapabilityRegistry?: ApiCapabilityRegistry
  diagnosisAgent?: DiagnosisAgentPort
  planningAgent?: PlanningAgentPort
  securityAgent?: SecurityAgentPort
  minimumDiagnosisConfidence?: number
  freezeWindow?: boolean | ((incident: SupervisorIncident, context: CognitiveContext) => boolean)
}

function proposedToRepairStep(step: ProposedStep): RepairStep {
  return {
    stepId: step.stepId,
    action: step.action,
    description: step.justification,
    protectedAction: step.protectedAction,
    parameters: { ...step.parameters, ...(step.capabilityId ? { actionId: step.capabilityId } : {}) },
    ...(step.expectedResult ? { expectedResult: step.expectedResult } : {}),
  }
}

export class MultiAgentReasoningEngine implements Thinker {
  private readonly evidence: EvidenceCollector
  private readonly contextBuilder = new ContextBuilder()
  private readonly diagnosisAgent: DiagnosisAgentPort
  private readonly validator = new DiagnosisValidator()
  private readonly planningAgent: PlanningAgentPort
  private readonly securityAgent: SecurityAgentPort
  private readonly capabilities: CapabilityMatcher
  private readonly minimumDiagnosisConfidence: number
  private readonly freezeWindow: MultiAgentEngineOptions['freezeWindow']

  constructor(options: MultiAgentEngineOptions = {}) {
    this.evidence = new EvidenceCollector(options.evidenceSources)
    this.diagnosisAgent = options.diagnosisAgent ?? new DiagnosisAgent()
    this.planningAgent = options.planningAgent ?? new PlanningAgent(options)
    this.securityAgent = options.securityAgent ?? new SecurityAgent()
    this.capabilities = new CapabilityMatcher(options.apiCapabilityRegistry)
    this.minimumDiagnosisConfidence = options.minimumDiagnosisConfidence ?? 70
    this.freezeWindow = options.freezeWindow ?? false
  }

  async synthesize(incident: SupervisorIncident): Promise<MultiAgentSynthesis> {
    const evidence = await this.evidence.collect(incident)
    const context = immutablePayload(this.contextBuilder.build(incident, evidence))
    const enrichedIncident = this.contextBuilder.enrichIncident(incident, context)

    const diagnosis = immutablePayload(await this.diagnosisAgent.analyze({ incident: enrichedIncident, context }))
    const diagnosisValidation = immutablePayload(this.validator.validate(enrichedIncident, context, diagnosis, this.minimumDiagnosisConfidence))
    if (!diagnosisValidation.valid) {
      throw new Error(`Diagnosis validation failed closed: ${diagnosisValidation.reasons.join('; ')}`)
    }

    const proposedPlan = immutablePayload(await this.planningAgent.propose({ incident: enrichedIncident, context, diagnosis }))
    const freezeWindow = typeof this.freezeWindow === 'function' ? this.freezeWindow(enrichedIncident, context) : this.freezeWindow
    const securityAssessment = immutablePayload(await this.securityAgent.review({ incident: enrichedIncident, context, diagnosis, plan: proposedPlan, freezeWindow }))
    const blockers = securityAssessment.findings.filter(item => item.severity === 'blocker')
    if (blockers.length > 0) {
      throw new Error(`Security review failed closed: ${blockers.map(item => item.code).join(', ')}`)
    }

    const steps = proposedPlan.steps.map(proposedToRepairStep)
    const verificationSteps = proposedPlan.verificationSteps.map(proposedToRepairStep)
    const rollbackSteps = proposedPlan.rollbackSteps.map(proposedToRepairStep)
    const requiresBrowser = [...steps, ...verificationSteps].some(step => ['navigate', 'click', 'fill', 'select', 'screenshot'].includes(step.action))

    const candidate: RepairPlan = {
      planId: proposedPlan.planId,
      incidentId: proposedPlan.incidentId,
      diagnosis: proposedPlan.diagnosis,
      confidenceScore: proposedPlan.confidenceScore,
      requiresBrowser,
      riskLevel: securityAssessment.riskAssessment,
      targetProvider: proposedPlan.targetProvider,
      targetEnvironment: proposedPlan.targetEnvironment,
      ...(proposedPlan.targetOrigin ? { targetOrigin: proposedPlan.targetOrigin } : {}),
      steps,
      verificationSteps,
      ...(rollbackSteps.length ? { rollbackSteps } : {}),
      generatedAt: proposedPlan.generatedAt,
      schemaVersion: 'supervisor-multi-agent-plan-v1',
    }

    const plan = repairPlanSchema.parse(candidate)
    this.capabilities.assertPlanAdmissible(plan)

    return {
      plan,
      trace: { context, diagnosis, diagnosisValidation, proposedPlan, securityAssessment },
    }
  }

  async proposeRepairPlan(incident: SupervisorIncident): Promise<RepairPlan> {
    return (await this.synthesize(incident)).plan
  }
}

export function createMultiAgentReasoningEngine(options: MultiAgentEngineOptions = {}): MultiAgentReasoningEngine {
  return new MultiAgentReasoningEngine(options)
}
