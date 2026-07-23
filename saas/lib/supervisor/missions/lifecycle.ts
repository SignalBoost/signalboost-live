import { DefaultSupervisorPolicyEngine } from '../policy-engine.ts'
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
} from './models.ts'
import type { MissionStore } from './store.ts'
import { missionTopics } from './topics.ts'

export interface MissionLifecycleDeps {
  eventBus: MissionEventBus
  clock: () => string
  id: (kind: string) => string
  missionStore: MissionStore
}

const envelope = <T>(
  payload: T,
  eventId: string,
  occurredAt: string,
  correlationId: string,
): MissionEventEnvelope<T> => ({ eventId, occurredAt, correlationId, causationId: null, idempotencyKey: eventId, revision: 1, schemaVersion: 'mission-envelope-v1', payload })

export class MissionOrchestrator {
  constructor(private readonly deps: MissionLifecycleDeps) {}

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
  constructor(private readonly deps: MissionLifecycleDeps) {}

  async start() {
    return this.deps.eventBus.subscribe<Mission>(missionTopics.missions, async (event) => {
      const mission = missionSchema.parse(event.payload)
      if (mission.missionType !== 'ci_failure_manual_review') return
      const now = this.deps.clock()
      const decision = decisionEnvelopeSchema.parse({
        decisionId: this.deps.id('decision'),
        missionId: mission.missionId,
        missionRevision: mission.revision,
        actionType: 'route_to_manual_review',
        riskLevel: 'low',
        targetProvider: null,
        targetEnvironment: mission.environment,
        proposedAction: 'Proposed manual-review action: route this CI failure to a human reviewer. No repair or external action will run.',
        shellCommand: null,
        url: null,
        credentials: null,
        externalSideEffect: false,
        createdAt: now,
        schemaVersion: 'mission-decision-v1',
      })
      await this.deps.eventBus.publish(
        missionTopics.rawDecisions,
        envelope(decision, this.deps.id('decision-event'), now, mission.correlationId),
      )
    })
  }
}

export class MissionSafetyGateway {
  constructor(private readonly deps: MissionLifecycleDeps) {}

  async start() {
    return this.deps.eventBus.subscribe<DecisionEnvelope>(missionTopics.rawDecisions, async (event) => {
      const now = this.deps.clock()
      let outcome: GuardrailOutcome
      let decision: DecisionEnvelope | undefined

      try {
        decision = decisionEnvelopeSchema.parse(event.payload)
        const mission = await this.deps.missionStore.get(decision.missionId)
        if (!mission || mission.revision !== decision.missionRevision) throw new Error('stale_or_missing_mission')
        if (decision.targetEnvironment === 'production') throw new Error('production_mutation_rejected')

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
          plan: {
            planId: decision.decisionId,
            incidentId: mission.missionId,
            diagnosis: decision.proposedAction,
            confidenceScore: 100,
            requiresBrowser: false,
            riskLevel: 'low',
            targetProvider: 'none',
            targetEnvironment: mission.environment,
            steps: [{
              stepId: 'manual-route',
              action: 'stop',
              description: decision.proposedAction,
              protectedAction: false,
              parameters: {},
            }],
            verificationSteps: [{
              stepId: 'verify-route',
              action: 'verify',
              description: 'Record manual routing.',
              protectedAction: false,
              parameters: {},
            }],
            generatedAt: now,
            schemaVersion: 'mission-policy-plan-v1',
          },
          mode: 'passive',
          context: {},
        })

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
        await this.deps.eventBus.publish(
          missionTopics.approvedDecisions,
          envelope({ decision, outcome }, this.deps.id('approved-decision-event'), now, event.correlationId),
        )
      }
    })
  }
}

export class NonMutatingMissionExecutor {
  constructor(private readonly deps: MissionLifecycleDeps) {}

  async start() {
    return this.deps.eventBus.subscribe<{ decision: DecisionEnvelope; outcome: GuardrailOutcome }>(
      missionTopics.approvedDecisions,
      async (event) => {
        const { decision, outcome } = event.payload
        if (outcome.status !== 'approved') return
        const now = this.deps.clock()
        const feedback: ExecutionFeedback = executionFeedbackSchema.parse({
          feedbackId: this.deps.id('feedback'),
          missionId: decision.missionId,
          decisionId: decision.decisionId,
          missionRevision: decision.missionRevision,
          status: 'manual_review_routed',
          recordedAt: now,
          schemaVersion: 'mission-execution-v1',
        })
        await this.deps.eventBus.publish(
          missionTopics.executions,
          envelope(feedback, this.deps.id('execution-event'), now, event.correlationId),
        )
      },
    )
  }
}
