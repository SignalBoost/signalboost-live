import type { SerializableValue, SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'

export type ReasoningIncidentShape =
  | 'availability'
  | 'deployment'
  | 'saturation'
  | 'latency'
  | 'errors'
  | 'data_freshness'
  | 'unclassified'

export type ReasoningBlastRadius = 'local' | 'service' | 'environment'

export interface RewrittenTask {
  incidentId: string
  provider: string
  environment: SupervisorIncident['environment']
  canonicalGoal: string
  affectedResource: string
  shape: ReasoningIncidentShape
  scopeBoundaries: string[]
  assumedState: Record<string, SerializableValue>
}

export interface FailurePrediction {
  overallRiskLevel: RepairPlan['riskLevel']
  blastRadius: ReasoningBlastRadius
  failureModes: string[]
  hasMutation: boolean
  requiresBrowser: boolean
  requiresHumanAttention: boolean
}

export interface PlanningDecision {
  diagnosis: string
  confidenceScore: number
  riskLevel: RepairPlan['riskLevel']
  requiresBrowser: boolean
}

export interface FallbackDecision {
  rollbackSteps: RepairStep[]
  requiresRollback: boolean
  failClosedReason?: string
}

export interface RemediationStrategy {
  strategyId: string
  matches(input: { incident: SupervisorIncident; task: RewrittenTask }): boolean
  buildSteps(input: { incident: SupervisorIncident; task: RewrittenTask }): RepairStep[]
  buildVerificationSteps?(input: { incident: SupervisorIncident; task: RewrittenTask }): RepairStep[]
  buildRollbackSteps?(input: { incident: SupervisorIncident; task: RewrittenTask }): RepairStep[]
  resolveTargetOrigin?(input: { incident: SupervisorIncident; task: RewrittenTask }): string | undefined
}

export interface ReasoningTrace {
  task: RewrittenTask
  steps: RepairStep[]
  risk: FailurePrediction
  planning: PlanningDecision
  verificationSteps: RepairStep[]
  fallback: FallbackDecision
  strategyId?: string
}

export interface ReasoningSynthesis {
  plan: RepairPlan
  trace: ReasoningTrace
}
