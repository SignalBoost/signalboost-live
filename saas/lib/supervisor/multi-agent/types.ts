import type { IncidentEvidence, SerializableValue, SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'
import type { CognitiveContext } from '../cognitive/types.ts'

export type DiagnosisCategory = 'availability' | 'deployment' | 'saturation' | 'latency' | 'errors' | 'data_freshness' | 'unclassified'

export interface DiagnosisHypothesis {
  category: DiagnosisCategory
  explanation: string
  evidenceIds: string[]
  confidenceScore: number
}

export interface DiagnosisReport {
  diagnosisId: string
  incidentId: string
  hypotheses: DiagnosisHypothesis[]
  affectedResources: string[]
  evidenceIds: string[]
  missingEvidence: string[]
  confidenceScore: number
  summary: string
}

export interface DiagnosisValidation {
  valid: boolean
  reasons: string[]
  evidenceCoverage: number
}

export interface ProposedStep {
  stepId: string
  action: RepairStep['action']
  capabilityId?: string
  targetResource: string
  targetEnvironment: SupervisorIncident['environment']
  parameters: Record<string, SerializableValue>
  justification: string
  expectedResult?: string
  protectedAction: boolean
}

export interface ProposedPlan {
  planId: string
  diagnosisId: string
  incidentId: string
  targetProvider: string
  targetEnvironment: SupervisorIncident['environment']
  targetOrigin?: string
  diagnosis: string
  confidenceScore: number
  steps: ProposedStep[]
  verificationSteps: ProposedStep[]
  rollbackSteps: ProposedStep[]
  generatedAt: string
}

export type SecurityFindingSeverity = 'info' | 'warning' | 'blocker'

export interface SecurityFinding {
  findingId: string
  severity: SecurityFindingSeverity
  code: string
  message: string
  stepIds: string[]
}

export interface SecurityAssessment {
  assessmentId: string
  planId: string
  riskAssessment: RepairPlan['riskLevel']
  findings: SecurityFinding[]
  recommendedApprovalsCount: number
  recommendedRoles: string[]
  freezeWindow: boolean
  requiresHumanReview: boolean
}

export interface DiagnosisAgentPort {
  analyze(input: { incident: SupervisorIncident; context: CognitiveContext }): Promise<DiagnosisReport> | DiagnosisReport
}

export interface PlanningAgentPort {
  propose(input: { incident: SupervisorIncident; context: CognitiveContext; diagnosis: DiagnosisReport }): Promise<ProposedPlan> | ProposedPlan
}

export interface SecurityAgentPort {
  review(input: { incident: SupervisorIncident; context: CognitiveContext; diagnosis: DiagnosisReport; plan: ProposedPlan; freezeWindow: boolean }): Promise<SecurityAssessment> | SecurityAssessment
}

export interface MultiAgentTrace {
  context: CognitiveContext
  diagnosis: DiagnosisReport
  diagnosisValidation: DiagnosisValidation
  proposedPlan: ProposedPlan
  securityAssessment: SecurityAssessment
}

export interface MultiAgentSynthesis {
  plan: RepairPlan
  trace: MultiAgentTrace
}

export interface DiagnosisEvidenceBundle {
  context: CognitiveContext
  evidence: IncidentEvidence[]
}
