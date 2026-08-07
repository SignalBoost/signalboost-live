import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import type { ApiCapabilityRegistry } from '../executors/api-capability-registry.ts'
import { ReasoningEngine, type ReasoningEngineOptions } from '../reasoning/reasoning-engine.ts'
import { CapabilityMatcher } from './capability-matcher.ts'
import { ContextBuilder } from './context-builder.ts'
import { EvidenceCollector } from './evidence-collector.ts'
import type { CognitiveEvidenceSource, CognitiveSynthesis } from './types.ts'

export interface CognitiveEngineOptions extends ReasoningEngineOptions {
  evidenceSources?: readonly CognitiveEvidenceSource[]
  apiCapabilityRegistry?: ApiCapabilityRegistry
}

export class CognitiveReasoningEngine implements Thinker {
  private readonly evidence: EvidenceCollector
  private readonly context = new ContextBuilder()
  private readonly reasoning: ReasoningEngine
  private readonly capabilities: CapabilityMatcher

  constructor(options: CognitiveEngineOptions = {}) {
    this.evidence = new EvidenceCollector(options.evidenceSources)
    this.reasoning = new ReasoningEngine(options)
    this.capabilities = new CapabilityMatcher(options.apiCapabilityRegistry)
  }

  async synthesize(incident: SupervisorIncident): Promise<CognitiveSynthesis> {
    const evidence = await this.evidence.collect(incident)
    const context = this.context.build(incident, evidence)
    const enrichedIncident = this.context.enrichIncident(incident, context)
    const reasoning = this.reasoning.synthesize(enrichedIncident)
    const capabilityAdmissions = this.capabilities.assertPlanAdmissible(reasoning.plan)

    return {
      plan: reasoning.plan,
      trace: {
        context,
        capabilityAdmissions,
        reasoningPlanId: reasoning.plan.planId,
      },
    }
  }

  async proposeRepairPlan(incident: SupervisorIncident): Promise<RepairPlan> {
    return (await this.synthesize(incident)).plan
  }
}

export function createCognitiveReasoningEngine(options: CognitiveEngineOptions = {}): CognitiveReasoningEngine {
  return new CognitiveReasoningEngine(options)
}
