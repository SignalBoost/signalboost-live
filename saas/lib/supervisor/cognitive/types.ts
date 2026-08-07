import type { SerializableValue, IncidentEvidence, SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import type { RollbackOutcome } from '../executors/rollback-coordinator.ts'
import type { VerificationResult } from '../execution-contracts.ts'

export interface CognitiveEvidenceSource {
  sourceId: string
  collect(input: { incident: SupervisorIncident }): Promise<IncidentEvidence[]> | IncidentEvidence[]
}

export interface CognitiveContext {
  incidentId: string
  provider: string
  environment: SupervisorIncident['environment']
  severity: SupervisorIncident['severity']
  source: SupervisorIncident['source']
  affectedResource: string
  detectedAt: string
  evidence: IncidentEvidence[]
  evidenceTypes: string[]
  errorCode?: string
  metadata: Record<string, SerializableValue>
}

export interface CapabilityAdmission {
  stepId: string
  phase: 'repair' | 'rollback'
  executor: 'api' | 'browser' | 'read_only'
  known: boolean
  autoExecutable: boolean
  approvalRequired: boolean
  riskClass?: 'read_only' | 'routine_reversible' | 'consequential'
  reason: string
}

export interface CognitiveTrace {
  context: CognitiveContext
  capabilityAdmissions: CapabilityAdmission[]
  reasoningPlanId: string
}

export interface CognitiveSynthesis {
  plan: RepairPlan
  trace: CognitiveTrace
}

export interface ReplanInput {
  incident: SupervisorIncident
  previousPlan: RepairPlan
  verification: VerificationResult
  rollback?: RollbackOutcome
  attempt: number
}

export interface ReplanResult {
  parentPlanId: string
  reason: string
  plan: RepairPlan
  trace: CognitiveTrace
}
