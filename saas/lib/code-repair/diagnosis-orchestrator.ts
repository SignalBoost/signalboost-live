import { buildCodeRepairContext } from './context-builder.ts'
import type { CodeRepairContextPolicy } from './contracts.ts'
import type { CodeRepairPlan, GitHubWorkflowFailureSnapshot } from './diagnosis-contracts.ts'
import { observeGitHubWorkflowFailure } from './github-failure-observer.ts'
import { analyzeCodeRepairRootCause } from './root-cause-analyzer.ts'
import { createCodeRepairPlan } from './repair-planner.ts'

export interface CodeRepairDiagnosisResult {
  plan: CodeRepairPlan
}

export async function diagnoseGitHubWorkflowFailure(
  repositoryRoot: string,
  snapshot: GitHubWorkflowFailureSnapshot,
  policyOverrides: Partial<CodeRepairContextPolicy> = {},
): Promise<CodeRepairDiagnosisResult> {
  const failure = observeGitHubWorkflowFailure(snapshot)
  const context = await buildCodeRepairContext(repositoryRoot, failure, policyOverrides)
  const diagnosis = analyzeCodeRepairRootCause(context)
  return Object.freeze({ plan: createCodeRepairPlan(diagnosis) })
}
