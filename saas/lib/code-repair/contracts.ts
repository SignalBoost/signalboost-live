import type { ContextSelectionResult, RepositoryManifest } from '../repository-intelligence/contracts.ts'

export type CodeRepairFailureCategory =
  | 'typecheck'
  | 'unit_test'
  | 'integration_test'
  | 'build'
  | 'lint'
  | 'security'
  | 'deployment'
  | 'unknown'

export type CodeRepairRiskLevel = 'low' | 'medium' | 'high'

export interface CodeRepairFailureInput {
  incidentId: string
  repository: string
  commitSha: string
  workflowName?: string
  failedJob?: string
  failedStep?: string
  category?: CodeRepairFailureCategory
  logs: string
  changedFiles?: readonly string[]
  symbolHints?: readonly string[]
}

export interface NormalizedCodeRepairFailure {
  incidentId: string
  repository: string
  commitSha: string
  workflowName: string | null
  failedJob: string | null
  failedStep: string | null
  category: CodeRepairFailureCategory
  sanitizedLogs: string
  changedFiles: readonly string[]
  symbolHints: readonly string[]
  fingerprint: string
}

export interface CodeRepairContextPolicy {
  maximumLogCharacters: number
  maximumChangedFiles: number
  maximumSymbolHints: number
  maximumRepositoryFiles: number
  maximumRepositoryBytes: number
  maximumSelectedFiles: number
  maximumSelectedBytes: number
}

export interface CodeRepairContextPackage {
  failure: NormalizedCodeRepairFailure
  manifest: RepositoryManifest
  selectedContext: ContextSelectionResult
  riskLevel: CodeRepairRiskLevel
  requiresHumanApproval: true
  repositoryWritesAllowed: false
  networkAccessAllowed: false
}
