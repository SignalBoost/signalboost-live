// saas/lib/supervisor/missions/lifecycle.ts
import { DefaultSupervisorPolicyEngine } from '../policy-engine.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import type { MissionEventBus, MissionEventEnvelope } from './event-bus.ts'
import {
  decisionEnvelopeSchema,
  executionFeedbackSchema,
  guardrailOutcomeSchema,
  missionEventSchema,
  missionSchema,
  type DecisionEnvelope,
  type ExecutionFeedback,
  type GuardrailOutcome,
  type Mission,
  type PolicyDecisionBinding,
  policyDecisionBindingSchema,
} from './models.ts'
import { fingerprintDecision, fingerprintPolicyBinding, fingerprintRepairPlan } from './fingerprints.ts'
import type { MissionStore } from './store.ts'
import type { MissionManualReviewStore } from './manual-review.ts'
import { missionTopics } from './topics.ts'

export interface MissionLifecycleDeps {
  eventBus: MissionEventBus
  clock: () => string
  id: (kind: string) => string
  missionStore: MissionStore
  manualReviewStore?: MissionManualReviewStore
}

const envelope = <T>(
  payload: T,
  eventId: string,
  occurredAt: string,
  correlationId: string,
): MissionEventEnvelope<T> => ({ eventId, occurredAt, correlationId, causationId: null, idempotencyKey: eventId, revision: 1, schemaVersion: 'mission-envelope-v1', payload })

export class MissionOrchestrator {
  private readonly deps: MissionLifecycleDeps
  constructor(deps: MissionLifecycleDeps) { this.deps = deps;}

  async accept(event: unknown): Promise<Mission> {
    const input = missionEventSchema.parse(event)
    const now = this.deps.clock()
    const mission = missionSchema.parse({
      missionId: this.deps.id('mission'),
      missionType: 'ci_failure_manual_review',
      revision: 1,
      status: 'NEW',
      environment: input.environment,
      title: 'CI failure requires manual review',
      objective: 'Route the detected CI failure to human review without executing a repair.',
      correlationId: input.correlationId,
      sourceEventIds: [input.eventId],
      riskLevel: 'low',
      createdAt: now,
      updatedAt: now,
      metadata: { eventType: input.eventType },
      schemaVersion: 'mission-v1',
    })
    const missionEvent = envelope(mission, this.deps.id('mission-event'), now, mission.correlationId)
    const saved = await this.deps.missionStore.createWithOutbox(mission, missionTopics.missions, missionEvent)
    await this.deps.eventBus.publish(missionTopics.missions, missionEvent)
    return saved
  }
}

export class RuleBasedMissionReasoner {
  private readonly deps: MissionLifecycleDeps
  constructor(deps: MissionLifecycleDeps) { this.deps = deps;}

  async start() {
    return this.deps.eventBus.subscribe<Mission>(missionTopics.missions, async (event) => {
      const mission = missionSchema.parse(event.payload)
      if (mission.missionType !== 'ci_failure_manual_review') return
      const now = this.deps.clock()
      const repairPlan: RepairPlan = {
        planId: this.deps.id('repair-plan'),
        incidentId: mission.missionId,
        diagnosis: 'Route this CI failure to human review only.',
        confidenceScore: 100,
        requiresBrowser: false,
        riskLevel: 'low',
        targetProvider: 'none',
        targetEnvironment: mission.environment,
        steps: [{
          stepId: 'manual-route',
          action: 'stop',
          description: 'Stop automation and route the CI failure to human review.',
          protectedAction: false,
          parameters: {},
        }],
        verificationSteps: [{
          stepId: 'verify-route',
          action: 'verify',
          description: 'Record the manual-review route.',
          protectedAction: false,
          parameters: {},
        }],
        generatedAt: now,
        schemaVersion: 'mission-repair-plan-v1',
      }
      const base = {
        decisionId: this.deps.id('decision'),
        missionId: mission.missionId,
        missionRevision: mission.revision,
        actionType: 'route_to_manual_review' as const,
        repairPlan,
        riskLevel: 'low' as const,
        targetEnvironment: mission.environment,
        confidence: 100,
        externalSideEffect: false as const,
        createdAt: now,
        expiresAt: new Date(Date.parse(now) + 15 * 60_000).toISOString(),
        schemaVersion: 'mission-decision-v1',
      }
      const planFingerprint = fingerprintRepairPlan({ missionId: base.missionId, missionRevision: base.missionRevision, decisionId: base.decisionId, environment: base.targetEnvironment, actionType: base.actionType, plan: repairPlan })
      const decision = decisionEnvelopeSchema.parse({ ...base, planFingerprint, decisionFingerprint: fingerprintDecision({ ...base, planFingerprint }) })
      await this.deps.eventBus.publish(
        missionTopics.rawDecisions,
        envelope(decision, this.deps.id('decision-event'), now, mission.correlationId),
      )
    })
  }
}

export class MissionSafetyGateway {
  private readonly deps: MissionLifecycleDeps
  constructor(deps: MissionLifecycleDeps) { this.deps = deps;}

  async start() {
    return this.deps.eventBus.subscribe<DecisionEnvelope>(missionTopics.rawDecisions, async (event) => {
      const now = this.deps.clock()
      let outcome: GuardrailOutcome
      let decision: DecisionEnvelope | undefined
      let approvedStepIds: string[] = []

      try {
        decision = decisionEnvelopeSchema.parse(event.payload)
        const mission = await this.deps.missionStore.get(decision.missionId)
        if (!mission || mission.revision !== decision.missionRevision) throw new Error('stale_or_missing_mission')
        if (Date.parse(decision.expiresAt) <= Date.parse(now)) throw new Error('decision_expired')
        if (['COMPLETED', 'CANCELED', 'FAILED', 'BLOCKED'].includes(mission.status)) throw new Error('mission_not_eligible')

        const policy = new DefaultSupervisorPolicyEngine().evaluate({
          incident: {
            incidentId: mission.missionId,
            provider: 'none',
            environment: mission.environment,
            severity: 'warning',
            detectedAt: now,
            source: 'api',
            errorMessage: 'CI failure requires manual review.',
            evidence: [{ evidenceId: 'mission', type: 'mission', capturedAt: now, summary: 'manual routing only' }],
            metadata: {},
          },
          plan: decision.repairPlan,
          mode: 'passive',
          context: {},
        })
        approvedStepIds = policy.approvedStepIds

        outcome = {
          outcomeId: this.deps.id('guardrail'),
          missionId: mission.missionId,
          decisionId: decision.decisionId,
          missionRevision: decision.missionRevision,
          status: policy.outcome,
          reasons: [policy.reason],
          evaluatedAt: now,
          policyVersion: policy.policyVersion,
          schemaVersion: 'mission-guardrail-v1',
        }
      } catch (error) {
        const payload = event.payload as Partial<DecisionEnvelope> | undefined
        outcome = {
          outcomeId: this.deps.id('guardrail'),
          missionId: payload?.missionId ?? 'unknown',
          decisionId: payload?.decisionId ?? 'unknown',
          missionRevision: payload?.missionRevision ?? 1,
          status: 'blocked',
          reasons: [error instanceof Error ? error.message : 'invalid_decision'],
          evaluatedAt: now,
          policyVersion: 'supervisor-core-v1',
          schemaVersion: 'mission-guardrail-v1',
        }
      }

      outcome = guardrailOutcomeSchema.parse(outcome)
      await this.deps.eventBus.publish(
        missionTopics.guardrails,
        envelope(outcome, this.deps.id('guardrail-event'), now, event.correlationId),
      )

      if (decision && outcome.status === 'approved') {
        const bindingBase = {
          decisionId: decision.decisionId,
          missionId: decision.missionId,
          missionRevision: decision.missionRevision,
          decisionFingerprint: decision.decisionFingerprint,
          planFingerprint: decision.planFingerprint,
          policyVersion: outcome.policyVersion,
          policyOutcome: outcome.status,
          approvedStepIds,
          evaluatedAt: now,
          expiresAt: decision.expiresAt,
          schemaVersion: 'mission-policy-binding-v1',
        }
        const binding = policyDecisionBindingSchema.parse({ ...bindingBase, bindingFingerprint: fingerprintPolicyBinding(bindingBase) })
        await this.deps.eventBus.publish(
          missionTopics.approvedDecisions,
          envelope({ decision, binding }, this.deps.id('approved-decision-event'), now, event.correlationId),
        )
      }
    })
  }
}

export class NonMutatingMissionExecutor {
  private readonly routedBindings = new Set<string>()
  private readonly deps: MissionLifecycleDeps
  constructor(deps: MissionLifecycleDeps) { this.deps = deps;}

  async start() {
    return this.deps.eventBus.subscribe<{ decision: DecisionEnvelope; binding: PolicyDecisionBinding }>(
      missionTopics.approvedDecisions,
      async (event) => {
        const now = this.deps.clock()
        try {
          const decision = decisionEnvelopeSchema.parse(event.payload.decision)
          const binding = policyDecisionBindingSchema.parse(event.payload.binding)
          if (binding.policyOutcome !== 'approved' || !binding.approvedStepIds.length || binding.decisionId !== decision.decisionId || binding.missionId !== decision.missionId || binding.missionRevision !== decision.missionRevision || binding.decisionFingerprint !== decision.decisionFingerprint || binding.planFingerprint !== decision.planFingerprint || Date.parse(decision.expiresAt) <= Date.parse(now) || Date.parse(binding.expiresAt) <= Date.parse(now)) return
          const mission = await this.deps.missionStore.get(decision.missionId)
          if (!mission || mission.revision !== decision.missionRevision || ['COMPLETED', 'CANCELED', 'FAILED', 'BLOCKED'].includes(mission.status) || decision.externalSideEffect !== false) return
          const ids = new Set(decision.repairPlan.steps.map(step => step.stepId))
          if (new Set(binding.approvedStepIds).size !== binding.approvedStepIds.length || binding.approvedStepIds.some(id => !ids.has(id))) return
          if (!this.deps.manualReviewStore) return
          const review = await this.deps.manualReviewStore.route({
            reviewId: this.deps.id('manual-review'), decision, binding,
            title: mission.title, summary: mission.objective, routedAt: now,
            schemaVersion: 'mission-manual-review-v1',
          })
          if (this.routedBindings.has(binding.bindingFingerprint)) return
          this.routedBindings.add(binding.bindingFingerprint)
          const feedback: ExecutionFeedback = executionFeedbackSchema.parse({
            feedbackId: this.deps.id('feedback'), missionId: decision.missionId,
            decisionId: decision.decisionId, missionRevision: decision.missionRevision,
            reviewId: review.reviewId, status: 'manual_review_routed', recordedAt: now,
            schemaVersion: 'mission-execution-v1',
          })
          await this.deps.eventBus.publish(
            missionTopics.executions,
            envelope(feedback, this.deps.id('execution-event'), now, event.correlationId),
          )
        } catch {
          return
        }
      },
    )
  }
}
