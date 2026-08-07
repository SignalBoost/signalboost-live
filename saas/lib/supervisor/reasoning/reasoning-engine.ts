import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import { repairPlanSchema, type RepairPlan } from '../repair-plan-schema.ts'
import { FailurePredictor } from './failure-predictor.ts'
import { FallbackStrategyHooks } from './fallback-strategy.ts'
import { PlanningLogic } from './planning-logic.ts'
import { StepDecomposer } from './step-decomposer.ts'
import { TaskRewriter } from './task-rewriter.ts'
import { VerificationLogic } from './verification-logic.ts'
import type { ReasoningSynthesis, RemediationStrategy } from './types.ts'

export const REASONING_PLAN_SCHEMA_VERSION = 'supervisor-reasoning-plan-v1'

export interface ReasoningEngineOptions {
  now?: () => Date
  strategies?: readonly RemediationStrategy[]
}

const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'unknown'

function selectStrategy(incident: SupervisorIncident, task: ReturnType<TaskRewriter['rewrite']>, strategies: readonly RemediationStrategy[]): RemediationStrategy | undefined {
  const matches = strategies.filter(strategy => strategy.matches({ incident, task }))
  if (matches.length > 1) {
    throw new Error(`Reasoning engine found multiple remediation strategies for incident ${incident.incidentId}: ${matches.map(item => item.strategyId).join(', ')}`)
  }
  return matches[0]
}

export class ReasoningEngine implements Thinker {
  private readonly now: () => Date
  private readonly strategies: readonly RemediationStrategy[]
  private readonly rewriter = new TaskRewriter()
  private readonly decomposer = new StepDecomposer()
  private readonly predictor = new FailurePredictor()
  private readonly planning = new PlanningLogic()
  private readonly verification = new VerificationLogic()
  private readonly fallbacks = new FallbackStrategyHooks()

  constructor(options: ReasoningEngineOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.strategies = [...(options.strategies ?? [])]
  }

  synthesize(incident: SupervisorIncident): ReasoningSynthesis {
    const task = this.rewriter.rewrite(incident)
    const strategy = selectStrategy(incident, task, this.strategies)
    const steps = this.decomposer.decompose({ incident, task, strategy })
    const risk = this.predictor.predict({ incident, task, steps })
    const planning = this.planning.decide({ task, risk, strategyId: strategy?.strategyId })
    const verificationSteps = this.verification.build({ incident, task, steps, strategy })
    const fallback = this.fallbacks.build({ incident, task, risk, strategy })

    if (fallback.failClosedReason) throw new Error(fallback.failClosedReason)

    const plan: RepairPlan = {
      planId: `reason-${safeId(incident.incidentId)}`,
      incidentId: incident.incidentId,
      diagnosis: planning.diagnosis,
      confidenceScore: planning.confidenceScore,
      requiresBrowser: planning.requiresBrowser,
      riskLevel: planning.riskLevel,
      targetProvider: incident.provider,
      targetEnvironment: incident.environment,
      steps,
      verificationSteps,
      ...(fallback.rollbackSteps.length ? { rollbackSteps: fallback.rollbackSteps } : {}),
      generatedAt: this.now().toISOString(),
      schemaVersion: REASONING_PLAN_SCHEMA_VERSION,
    }

    const parsed = repairPlanSchema.parse(plan)
    return {
      plan: parsed,
      trace: {
        task,
        steps: parsed.steps,
        risk,
        planning,
        verificationSteps: parsed.verificationSteps,
        fallback: { ...fallback, rollbackSteps: parsed.rollbackSteps ?? [] },
        ...(strategy ? { strategyId: strategy.strategyId } : {}),
      },
    }
  }

  proposeRepairPlan(incident: SupervisorIncident): RepairPlan {
    return this.synthesize(incident).plan
  }
}

export function createReasoningEngine(options: ReasoningEngineOptions = {}): ReasoningEngine {
  return new ReasoningEngine(options)
}
