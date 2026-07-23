import type { CodeSandboxProvider, SandboxExecutionRequest, SandboxExecutionResult, SandboxSession } from './contracts.ts'
import type { SandboxRuntimePolicy } from './policy.ts'
import { classifySandboxFailure, type SandboxFailureCategory } from './failure-classifier.ts'
import { DEFAULT_SANDBOX_RUNTIME_POLICY, assertSafeSandboxRuntimePolicy, truncateSandboxOutput } from './policy.ts'
import { appendStageResult, cleanupAttempt, createRepairAttempt, recordAttemptFailure, repairHistory, updateRepairAttempt } from './repair-history.ts'
import { buildRepairPrompt, sanitizeRepairDiagnostic } from './repair-prompts.ts'
import type { BoundedRepairFailure, CleanupStatus, RepairCandidate, RepairCandidateGenerator, RepairControllerResult, RepairDiagnostic, RepairStage, RepairStageResult, RepairWorkflowRequest, VerifiedRepairResult, WorkflowTimingMetadata } from './repair-types.ts'

const STAGES = ['static_analysis', 'tests', 'execution'] as const
const VIRTUAL_WORKSPACE = '/workspace'
const MAX_CANDIDATE_TEXT = 64 * 1024
export interface RepairControllerDependencies { provider: CodeSandboxProvider; generator: RepairCandidateGenerator; policy?: SandboxRuntimePolicy; now?: () => number }

function bounded(value: string | undefined, maximum: number): string { return truncateSandboxOutput(value ?? '', maximum).value }
function exceptionSummary(error: unknown): string { return sanitizeRepairDiagnostic(error instanceof Error ? error.message : 'An internal provider error occurred.') }
function timing(startedAtMs: number, now: () => number, deadlineMs: number): WorkflowTimingMetadata { const completedAtMs = now(); return Object.freeze({ startedAtMs, completedAtMs, totalDurationMs: Math.max(0, completedAtMs - startedAtMs), deadlineMs }) }
function diagnostic(category: SandboxFailureCategory, stage: RepairStage, message: string, retryable = false, exitCode = 1, timedOut = false): RepairDiagnostic { return Object.freeze({ category, stage, safeSummary: sanitizeRepairDiagnostic(message), retryable, exitCode, timedOut }) }

/** One inert provider session is created per workflow and destroyed exactly once in finally. */
export class RepairController {
  private readonly policy: Readonly<SandboxRuntimePolicy>; private readonly now: () => number
  constructor(private readonly dependencies: RepairControllerDependencies) { this.policy = assertSafeSandboxRuntimePolicy({ ...DEFAULT_SANDBOX_RUNTIME_POLICY, ...dependencies.policy }); this.now = dependencies.now ?? Date.now }
  async run(request: RepairWorkflowRequest): Promise<RepairControllerResult> {
    const startedAtMs = this.now(), deadlineMs = startedAtMs + this.policy.maximumWorkflowTimeMs, maxCandidates = this.policy.maximumCorrectionAttempts + 1
    const attempts: ReturnType<typeof createRepairAttempt>[] = []; let session: SandboxSession | undefined; let result: RepairControllerResult | undefined
    const cleanup: CleanupStatus = { attempted: false, succeeded: false }
    const failed = (failure: RepairDiagnostic, attemptsExhausted = false, workflowTimedOut = false): BoundedRepairFailure => ({ verified: false, category: failure.category, failedStage: failure.stage, diagnostic: failure, attemptsUsed: attempts.length, candidatesEvaluated: attempts.length, correctionsRequested: Math.max(0, attempts.length - 1), attemptsExhausted, workflowTimedOut, history: repairHistory(attempts, maxCandidates), timing: timing(startedAtMs, this.now, deadlineMs), cleanup })
    const expired = (): boolean => this.now() >= deadlineMs
    workflow: try {
      try { session = await this.dependencies.provider.createSession({ workspaceId: request.workspaceId ?? `repair:${request.requestId}`, declaredWorkspacePath: VIRTUAL_WORKSPACE, capabilities: [] }) }
      catch (error) { result = failed(diagnostic('sandbox_unavailable', 'generation', exceptionSummary(error), false)); break workflow }
      let candidate: RepairCandidate
      try { candidate = await this.dependencies.generator.generateInitial(request) }
      catch (error) { const attempt = createRepairAttempt(1, { source: '', language: request.language }, this.now()); attempts.push(recordAttemptFailure(attempt, diagnostic('internal', 'generation', exceptionSummary(error), false), this.now())); result = failed(attempts[0].failure!); break workflow }
      for (let attemptNumber = 1; attemptNumber <= maxCandidates; attemptNumber++) {
        if (expired()) { result = failed(diagnostic('timeout', 'generation', 'Workflow time limit reached.', false, 124, true), false, true); break workflow }
        if (candidate.language !== request.language) { const attempt = recordAttemptFailure(createRepairAttempt(attemptNumber, candidate, this.now()), diagnostic('invalid_request', 'generation', 'Candidate language does not match the required language.', false), this.now()); attempts.push(attempt); result = failed(attempt.failure!); break workflow }
        let attempt = createRepairAttempt(attemptNumber, { ...candidate, source: bounded(candidate.source, MAX_CANDIDATE_TEXT), tests: bounded(candidate.tests, MAX_CANDIDATE_TEXT) }, this.now())
        attempts.push(attempt); let failure: RepairDiagnostic | undefined; let allStages: RepairStageResult[] = []
        for (const stage of STAGES) {
          if (expired()) { failure = diagnostic('timeout', stage, 'Workflow time limit reached.', false, 124, true); break }
          const executionRequest: SandboxExecutionRequest = Object.freeze({ requestId: `${request.requestId}:attempt:${attemptNumber}:stage:${stage}`, language: candidate.language, stage, source: bounded(candidate.source, MAX_CANDIDATE_TEXT), tests: candidate.tests ? bounded(candidate.tests, MAX_CANDIDATE_TEXT) : undefined, workingDirectory: VIRTUAL_WORKSPACE, timeoutMs: Math.min(this.policy.maximumCommandExecutionTimeMs, Math.max(1, deadlineMs - this.now())) })
          let execution: SandboxExecutionResult
          try { execution = await this.dependencies.provider.execute(session, executionRequest) }
          catch (error) { failure = diagnostic('sandbox_unavailable', stage, exceptionSummary(error), false); break }
          const classified = classifySandboxFailure(execution)
          const summary = classified?.safeSummary ?? 'Stage completed successfully.'
          const stageResult: RepairStageResult = Object.freeze({ stage, succeeded: !classified, exitCode: execution.exitCode, timedOut: execution.timedOut, durationMs: Math.max(0, execution.durationMs), safeSummary: summary })
          attempt = appendStageResult(attempt, stageResult, this.now()); attempts[attempts.length - 1] = attempt; allStages.push(stageResult)
          if (classified) { failure = Object.freeze({ stage, category: classified.category, exitCode: classified.exitCode, timedOut: classified.timedOut, retryable: classified.retryable, safeSummary: sanitizeRepairDiagnostic(`${classified.safeSummary} ${classified.diagnosticMessage}`) }); break }
        }
        if (!failure) { const success: VerifiedRepairResult = { verified: true, candidate, candidatesEvaluated: attempts.length, correctionsRequested: attemptNumber - 1, stageResults: Object.freeze(allStages), history: repairHistory(attempts, maxCandidates), timing: timing(startedAtMs, this.now, deadlineMs), cleanup }; result = success; break workflow }
        attempt = recordAttemptFailure(attempt, failure, this.now()); attempts[attempts.length - 1] = attempt
        if (!failure.retryable || attemptNumber === maxCandidates) { result = failed(failure, attemptNumber === maxCandidates); break workflow }
        const repairPrompt = buildRepairPrompt({ request, diagnostic: failure, attemptNumber, maximumCorrectionAttempts: this.policy.maximumCorrectionAttempts })
        attempt = updateRepairAttempt(attempt, { correctionRequested: true }); attempts[attempts.length - 1] = attempt
        try { candidate = await this.dependencies.generator.generateCorrection({ request, previousCandidate: candidate, diagnostic: failure, attemptNumber: attemptNumber + 1, repairPrompt }) }
        catch (error) { const generationFailure = diagnostic('internal', 'generation', exceptionSummary(error), false); attempts[attempts.length - 1] = recordAttemptFailure(attempt, generationFailure, this.now()); result = failed(generationFailure); break workflow }
      }
      result = failed(diagnostic('internal', 'generation', 'Repair workflow reached an unexpected terminal state.', false)); break workflow
    } finally {
      if (session) {
        try { await this.dependencies.provider.destroySession(session); cleanup.attempted = true; cleanup.succeeded = true; delete cleanup.safeSummary }
        catch (error) { cleanup.attempted = true; cleanup.succeeded = false; cleanup.safeSummary = exceptionSummary(error) }
      }
      if (attempts.length) attempts[attempts.length - 1] = cleanupAttempt(attempts[attempts.length - 1], cleanup)
      if (result) {
        const history = repairHistory(attempts, maxCandidates)
        result = result.verified ? { ...result, history, cleanup: Object.freeze({ ...cleanup }), timing: timing(startedAtMs, this.now, deadlineMs) } : { ...result, history, cleanup: Object.freeze({ ...cleanup }), timing: timing(startedAtMs, this.now, deadlineMs) }
      }
    }
    return result ?? failed(diagnostic('internal', 'generation', 'Repair workflow did not produce a result.', false))
  }
}
