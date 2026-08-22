import { fingerprintCodeRepairProposal } from './approval.ts'
import type { CandidateLabCase, CandidateLabEvaluator } from './candidate-lab.ts'
import type { CodeRepairPatchProposal, CodeRepairValidationCommand, CodeRepairValidationWorkspace } from './patch-contracts.ts'

export interface CandidateLabSandboxCase extends CandidateLabCase {
  commands: readonly CodeRepairValidationCommand[]
}

export interface CandidateLabSandboxEvaluatorInput {
  baselineChangeFingerprint: string
  candidateProposal: CodeRepairPatchProposal
  cases: readonly CandidateLabSandboxCase[]
  workspace: CodeRepairValidationWorkspace
}

function assertCommand(command: CodeRepairValidationCommand): void {
  if (!command.id.trim() || !command.command.trim() || !Number.isSafeInteger(command.timeoutMs) || command.timeoutMs <= 0) throw new Error('Candidate Lab requires bounded validation commands.')
}

/**
 * Adapts the existing disposable code-repair workspace to the Candidate Lab evaluator contract.
 * Baseline workspaces never stage a patch; candidate workspaces stage only the already bounded,
 * approval-only proposal. Every workspace is destroyed before its observation is returned.
 */
export function createCandidateLabSandboxEvaluator(input: CandidateLabSandboxEvaluatorInput): CandidateLabEvaluator {
  const candidateFingerprint = fingerprintCodeRepairProposal(input.candidateProposal)
  if (!input.baselineChangeFingerprint.trim()) throw new Error('Candidate Lab requires a baseline change fingerprint.')
  if (input.candidateProposal.applicationAllowed || input.candidateProposal.mergeAllowed) throw new Error('Candidate Lab accepts approval-only patch proposals.')
  const cases = new Map<string, CandidateLabSandboxCase>()
  for (const testCase of input.cases) {
    if (!testCase.caseId.trim() || cases.has(testCase.caseId)) throw new Error('Candidate Lab sandbox cases require unique identifiers.')
    if (!testCase.commands.length) throw new Error('Candidate Lab sandbox cases require at least one validation command.')
    testCase.commands.forEach(assertCommand)
    cases.set(testCase.caseId, Object.freeze({ caseId: testCase.caseId, commands: Object.freeze([...testCase.commands]) }))
  }
  return Object.freeze({
    async evaluate(request) {
      const testCase = cases.get(request.caseId)
      if (!testCase) throw new Error('Candidate Lab received an unknown validation case.')
      const isCandidate = request.candidateChangeFingerprint === candidateFingerprint
      if (!isCandidate && request.candidateChangeFingerprint !== input.baselineChangeFingerprint) throw new Error('Candidate Lab received an unbound change fingerprint.')
      const workspace = await input.workspace.create({ workspaceId: `candidate-lab:${request.caseId}:${request.candidateChangeFingerprint.slice(0, 24)}`, baseCommitSha: input.candidateProposal.baseCommitSha })
      let cleanupSucceeded = false
      const results = [] as Awaited<ReturnType<CodeRepairValidationWorkspace['run']>>[]
      try {
        if (isCandidate) await input.workspace.stageUnifiedDiff(workspace, input.candidateProposal.unifiedDiff)
        for (const command of testCase.commands) {
          const result = await input.workspace.run(workspace, command)
          results.push(result)
          if (!result.succeeded) break
        }
      } finally {
        try { await input.workspace.destroy(workspace); cleanupSucceeded = true } catch { cleanupSucceeded = false }
      }
      const passed = cleanupSucceeded && results.length === testCase.commands.length && results.every(result => result.succeeded)
      return Object.freeze({
        passed,
        governancePassed: cleanupSucceeded,
        qualityScore: testCase.commands.length ? results.filter(result => result.succeeded).length / testCase.commands.length : 0,
      })
    },
  })
}
