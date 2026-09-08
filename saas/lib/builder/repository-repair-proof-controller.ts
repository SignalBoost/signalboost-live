import type { BuilderAiPort, BuilderRunnerPort, BuilderWorkspacePort } from './contracts.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'

export type RepositoryRepairProofController = Readonly<{
  ai: BuilderAiPort
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  proofCommand: string | null
}>

function normalizedProofCommand(value: unknown): string | null {
  const command = String(value || '').trim()
  return command ? command : null
}

/**
 * The host, not the model, chooses the command that proves a repository repair.
 * Exact failing test paths take precedence over a broad package test. When a failed
 * Vercel build did not identify a test file, the recorded build/prebuild command is
 * the proof. Unknown commands remain untrusted and do not manufacture a proof.
 */
export function repositoryRepairProofCommand(target: Pick<SignalBoostRepositoryRepairTarget, 'pathHints' | 'failedCommand'>): string | null {
  const failingTests = target.pathHints
    .map(path => path.replace(/^saas\//, ''))
    .filter(path => /^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
    .slice(0, 4)
  if (failingTests.length) return `node --experimental-strip-types --test ${failingTests.join(' ')}`

  const failedCommand = normalizedProofCommand(target.failedCommand)
  if (!failedCommand) return null
  return /vercel-cos-gates|npm run prebuild|next build|check-cos-blueprint|(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|typecheck|lint|build)(?:\s|$)|(?:^|\s)(?:node|python\d*)\b[^\n]*(?:--test|pytest|unittest)|(?:^|\s)(?:tsc|eslint|vitest|jest|playwright)(?:\s|$)/i.test(failedCommand)
    ? failedCommand
    : null
}

/**
 * Repository repair verification is a controller responsibility. This adapter makes
 * the exact host-selected proof the first action on the pinned source and the first
 * action after every successful mutation. The model therefore cannot skip the
 * fail-before/change/pass-after cycle by returning prose, diagnostics, or another
 * command. A passing baseline aborts before the model can edit a non-reproducing bug.
 */
export function createRepositoryRepairProofController(input: {
  ai: BuilderAiPort
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  proofCommand: string | null
}): RepositoryRepairProofController {
  const proofCommand = normalizedProofCommand(input.proofCommand)
  if (!proofCommand) return Object.freeze({ ai: input.ai, workspace: input.workspace, runner: input.runner, proofCommand: null })

  let workspaceGeneration = 0
  let provedGeneration = -1
  let baselineState: 'pending' | 'failed' | 'passed' | 'invalid' = 'pending'

  const workspace: BuilderWorkspacePort = {
    listFiles: (workspaceId) => input.workspace.listFiles(workspaceId),
    readFile: (workspaceId, path) => input.workspace.readFile(workspaceId, path),
    ...(typeof input.workspace.searchFiles === 'function'
      ? { searchFiles: (workspaceId: string, query: string) => input.workspace.searchFiles!(workspaceId, query) }
      : {}),
    async writeFile(workspaceId, path, content) {
      const file = await input.workspace.writeFile(workspaceId, path, content)
      workspaceGeneration += 1
      return file
    },
    async editFile(workspaceId, path, search, replace) {
      const file = await input.workspace.editFile(workspaceId, path, search, replace)
      workspaceGeneration += 1
      return file
    },
  }

  const runner: BuilderRunnerPort = {
    async run(runInput) {
      const proofRequired = provedGeneration !== workspaceGeneration
      const command = proofRequired ? proofCommand : runInput.command
      const result = await input.runner.run({ ...runInput, command })
      if (proofRequired) {
        provedGeneration = workspaceGeneration
        if (workspaceGeneration === 0) {
          baselineState = result.timedOut ? 'invalid' : result.exitCode === 0 ? 'passed' : 'failed'
        }
      }
      return Object.freeze({ ...result, executedCommand: result.executedCommand || command })
    },
  }

  const ai: BuilderAiPort = {
    async generate(request) {
      if (baselineState === 'passed' && workspaceGeneration === 0) throw new Error('builder_regression_not_reproduced')
      if (baselineState === 'invalid' && workspaceGeneration === 0) throw new Error('builder_regression_evidence_required')
      if (provedGeneration !== workspaceGeneration) {
        return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: proofCommand } })
      }
      return input.ai.generate(request)
    },
  }

  return Object.freeze({ ai, workspace, runner, proofCommand })
}
