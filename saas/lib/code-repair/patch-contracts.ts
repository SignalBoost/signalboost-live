import type { CodeRepairPlan } from './diagnosis-contracts.ts'

export interface CodeRepairFilePatch {
  path: string
  previousPath: string | null
  additions: number
  deletions: number
  hunks: number
  diff: string
}

export interface CodeRepairPatchProposal {
  proposalId: string
  planId: string
  incidentId: string
  baseCommitSha: string
  unifiedDiff: string
  files: readonly CodeRepairFilePatch[]
  totalAdditions: number
  totalDeletions: number
  requiresHumanApproval: true
  applicationAllowed: false
  mergeAllowed: false
}

export interface CodeRepairPatchPolicy {
  maximumDiffCharacters: number
  maximumFiles: number
  maximumChangedLines: number
  allowNewFiles: boolean
  allowDeletedFiles: boolean
  prohibitedPathPatterns: readonly RegExp[]
}

export interface CodeRepairPatchGenerator {
  generate(input: {
    plan: CodeRepairPlan
    baseCommitSha: string
    fileContents: Readonly<Record<string, string>>
  }): Promise<string>
}

export interface CodeRepairValidationCommand {
  id: string
  command: string
  timeoutMs: number
}

export interface CodeRepairValidationResult {
  commandId: string
  succeeded: boolean
  exitCode: number
  timedOut: boolean
  safeOutput: string
}

export interface CodeRepairValidationWorkspace {
  create(input: { workspaceId: string; baseCommitSha: string }): Promise<{ id: string }>
  stageUnifiedDiff(workspace: { id: string }, unifiedDiff: string): Promise<void>
  run(workspace: { id: string }, command: CodeRepairValidationCommand): Promise<CodeRepairValidationResult>
  destroy(workspace: { id: string }): Promise<void>
}

export interface CodeRepairPatchValidationReport {
  proposalId: string
  validated: boolean
  results: readonly CodeRepairValidationResult[]
  cleanupSucceeded: boolean
  repositoryModified: false
  networkAccessAllowed: false
}
