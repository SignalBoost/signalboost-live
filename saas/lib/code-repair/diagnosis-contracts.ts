import type { CodeRepairContextPackage, CodeRepairFailureCategory, CodeRepairRiskLevel } from './contracts.ts'

export interface GitHubWorkflowStepSnapshot {
  name: string
  status: string
  conclusion: string | null
  number: number
}

export interface GitHubWorkflowJobSnapshot {
  id: number
  name: string
  status: string
  conclusion: string | null
  steps: readonly GitHubWorkflowStepSnapshot[]
  logs?: string
}

export interface GitHubWorkflowFailureSnapshot {
  repository: string
  commitSha: string
  runId: number
  workflowName: string
  jobs: readonly GitHubWorkflowJobSnapshot[]
  changedFiles?: readonly string[]
}

export interface CodeRepairEvidence {
  kind: 'log' | 'changed_file' | 'selected_file' | 'test' | 'dependency' | 'workflow'
  reference: string
  summary: string
  weight: number
}

export interface CodeRepairRootCauseCandidate {
  id: string
  title: string
  explanation: string
  confidence: number
  category: CodeRepairFailureCategory
  suspectedFiles: readonly string[]
  evidence: readonly CodeRepairEvidence[]
}

export interface CodeRepairDiagnosis {
  incidentId: string
  primaryCause: CodeRepairRootCauseCandidate
  alternativeCauses: readonly CodeRepairRootCauseCandidate[]
  evidence: readonly CodeRepairEvidence[]
  context: CodeRepairContextPackage
}

export interface CodeRepairPlanStep {
  id: string
  action: 'inspect' | 'modify' | 'test' | 'review' | 'stop'
  description: string
  files: readonly string[]
  required: boolean
}

export interface CodeRepairPlan {
  planId: string
  incidentId: string
  diagnosisFingerprint: string
  problem: string
  rationale: string
  riskLevel: CodeRepairRiskLevel
  filesToInspect: readonly string[]
  filesAllowedToModify: readonly string[]
  testsToRun: readonly string[]
  steps: readonly CodeRepairPlanStep[]
  requiresHumanApproval: true
  patchGenerationAllowed: false
  patchApplicationAllowed: false
  mergeAllowed: false
}
