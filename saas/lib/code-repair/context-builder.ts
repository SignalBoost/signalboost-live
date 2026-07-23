import { buildImportGraph, createRepositoryManifest, selectRepositoryContext } from '../repository-intelligence/index.ts'
import type { CodeRepairContextPackage, CodeRepairContextPolicy, CodeRepairFailureInput, CodeRepairRiskLevel } from './contracts.ts'
import { normalizeCodeRepairFailure } from './failure-normalizer.ts'

export const DEFAULT_CODE_REPAIR_CONTEXT_POLICY: Readonly<CodeRepairContextPolicy> = Object.freeze({
  maximumLogCharacters: 24_000,
  maximumChangedFiles: 50,
  maximumSymbolHints: 25,
  maximumRepositoryFiles: 4_000,
  maximumRepositoryBytes: 32 * 1024 * 1024,
  maximumSelectedFiles: 20,
  maximumSelectedBytes: 96 * 1024,
})

function assertPolicy(policy: CodeRepairContextPolicy): Readonly<CodeRepairContextPolicy> {
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid code repair context policy: ${key}`)
  }
  return Object.freeze({ ...policy })
}

function riskLevel(category: CodeRepairContextPackage['failure']['category']): CodeRepairRiskLevel {
  if (category === 'security' || category === 'deployment') return 'high'
  if (category === 'build' || category === 'integration_test' || category === 'unknown') return 'medium'
  return 'low'
}

export async function buildCodeRepairContext(
  repositoryRoot: string,
  input: CodeRepairFailureInput,
  overrides: Partial<CodeRepairContextPolicy> = {},
): Promise<CodeRepairContextPackage> {
  const policy = assertPolicy({ ...DEFAULT_CODE_REPAIR_CONTEXT_POLICY, ...overrides })
  const failure = normalizeCodeRepairFailure(input, policy)
  const manifest = await createRepositoryManifest({
    repositoryRoot,
    maximumFiles: policy.maximumRepositoryFiles,
    maximumTotalBytes: policy.maximumRepositoryBytes,
    repositoryWrites: false,
    networkAccess: false,
  })
  const graph = await buildImportGraph(repositoryRoot, manifest)
  const selectedContext = await selectRepositoryContext(repositoryRoot, manifest, graph, {
    taskDescription: `${failure.category} ${failure.workflowName ?? ''} ${failure.failedJob ?? ''} ${failure.failedStep ?? ''} ${failure.sanitizedLogs}`,
    pathHints: failure.changedFiles,
    symbolHints: failure.symbolHints,
    maximumFiles: policy.maximumSelectedFiles,
    maximumTotalBytes: policy.maximumSelectedBytes,
  })
  return Object.freeze({
    failure,
    manifest,
    selectedContext,
    riskLevel: riskLevel(failure.category),
    requiresHumanApproval: true,
    repositoryWritesAllowed: false,
    networkAccessAllowed: false,
  })
}
