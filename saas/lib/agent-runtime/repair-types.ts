import type { RuntimeLanguage } from './contracts.ts'
import type { SandboxFailureCategory } from './failure-classifier.ts'

export type RepairStage = 'generation' | 'static_analysis' | 'tests' | 'execution' | 'cleanup'

export interface RepairWorkflowRequest {
  requestId: string
  language: RuntimeLanguage
  publicInterface: string
  requirements: string
  workspaceId?: string
}

export interface RepairCandidate {
  source: string
  tests?: string
  language: RuntimeLanguage
  metadata?: Readonly<Record<string, string>>
}

export interface RepairDiagnostic {
  stage: RepairStage
  category: SandboxFailureCategory
  exitCode: number
  timedOut: boolean
  retryable: boolean
  safeSummary: string
}

export interface RepairCandidateGenerator {
  generateInitial(request: RepairWorkflowRequest): Promise<RepairCandidate>
  generateCorrection(input: { request: RepairWorkflowRequest; previousCandidate: RepairCandidate; diagnostic: RepairDiagnostic; attemptNumber: number; repairPrompt: string }): Promise<RepairCandidate>
}

export interface RepairStageResult { stage: RepairStage; succeeded: boolean; exitCode: number; timedOut: boolean; durationMs: number; safeSummary: string }
export interface CleanupStatus { attempted: boolean; succeeded: boolean; safeSummary?: string }
export interface WorkflowTimingMetadata { startedAtMs: number; completedAtMs: number; totalDurationMs: number; deadlineMs: number }
export interface RepairAttempt {
  attemptNumber: number
  candidate: Readonly<{ language: RuntimeLanguage; sourceLength: number; testsLength: number; metadata: Readonly<Record<string, string>> }>
  stageStarted?: RepairStage
  stageCompleted?: RepairStage
  stageResults: readonly RepairStageResult[]
  failure?: RepairDiagnostic
  correctionRequested: boolean
  timing: Readonly<{ startedAtMs: number; completedAtMs: number; durationMs: number }>
  cleanup?: CleanupStatus
}
export interface RepairHistory { attempts: readonly RepairAttempt[]; maximumAttempts: number; diagnosticLimit: number }
export interface VerifiedRepairResult { verified: true; candidate: RepairCandidate; candidatesEvaluated: number; correctionsRequested: number; stageResults: readonly RepairStageResult[]; history: RepairHistory; timing: WorkflowTimingMetadata; cleanup: CleanupStatus }
export interface BoundedRepairFailure { verified: false; category: SandboxFailureCategory; failedStage: RepairStage; diagnostic: RepairDiagnostic; attemptsUsed: number; candidatesEvaluated: number; correctionsRequested: number; attemptsExhausted: boolean; workflowTimedOut: boolean; history: RepairHistory; timing: WorkflowTimingMetadata; cleanup: CleanupStatus }
export type RepairControllerResult = VerifiedRepairResult | BoundedRepairFailure
