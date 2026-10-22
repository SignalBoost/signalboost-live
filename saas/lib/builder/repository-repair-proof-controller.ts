import type { BuilderAiPort, BuilderRunnerPort, BuilderWorkspacePort } from './contracts.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { isBuilderTestRunnerCommand } from './regression-gate.ts'

export type RepositoryRepairProofController = Readonly<{
  ai: BuilderAiPort
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  proofCommand: string | null
}>

function normalizedProofCommand(value: unknown): string | null {
  const command = String(value || '').trim()
  if (!command) return null
  // Vercel can report a shell command ending in bare "next build". Inside the isolated
  // repository sandbox local package binaries are not globally on PATH, even after npm ci.
  // Preserve the recorded build semantics while resolving Next through the pinned package.
  return command.replace(/(^|&&|\|\||;)\s*next\s+build\b/gi, (_match, prefix) => `${prefix} npm exec -- next build`)
}

/**
 * The host, not the model, chooses the command that proves a repository repair.
 * Exact failing test paths take precedence over a broad package test. When a failed
 * Vercel build did not identify a test file, the recorded build/prebuild command is
 * the proof. Unknown commands remain untrusted and do not manufacture a proof.
 */
export function repositoryRepairProofCommand(target: Pick<SignalBoostRepositoryRepairTarget, 'pathHints' | 'failedCommand'> & Partial<Pick<SignalBoostRepositoryRepairTarget, 'failureEvidence'>>): string | null {
  const failingTests = target.pathHints
    .map(path => path.replace(/^saas\//, ''))
    .filter(path => /^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
    .slice(0, 4)
  if (failingTests.length) return `node --experimental-strip-types --test ${failingTests.join(' ')}`

  // Provider/CI failure excerpts often name the failing test but omit it from
  // structured pathHints. Extract only literal test paths, never shell syntax.
  // An ambiguous set is deliberately not selected as a proof.
  const evidenceText = Array.isArray(target.failureEvidence) ? target.failureEvidence.join('\n') : ''
  const evidenceTests = [...new Set(
    [...evidenceText.matchAll(/(?:saas\/)?tests?\/[A-Za-z0-9_.\/-]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)/g)]
      .map(match => match[0].replace(/^saas\//, ''))
      .filter(path => !path.includes('..'))
  )]
  if (evidenceTests.length === 1) return `node --experimental-strip-types --test ${evidenceTests[0]}`


  // A Vercel build that already reached TypeScript has supplied a much narrower reproducible
  // compiler failure than the complete 2,500+ test/gate command. Reproduce that compiler boundary
  // directly so Platform Engineer spends its bounded repair window editing and verifying source,
  // not replaying a minute of already-passing tests. PR CI still runs the complete production gate.
  const evidence = Array.isArray(target.failureEvidence) ? target.failureEvidence.join('\n') : ''
  if (/Failed to type check|(?:^|\\s)(?:error\\s+)?TS\\d{4}:/im.test(evidence)) return 'npm exec -- tsc --noEmit'

  const failedCommand = normalizedProofCommand(target.failedCommand)
  if (!failedCommand) return null
  // Repository-wide suites are blocked by the sandbox. Without a named failing test,
  // replaying them cannot establish a baseline; guessing a nearby test is not proof.
  if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\s*$/i.test(failedCommand)) return null
  return /vercel-cos-gates|npm run prebuild|next build|check-cos-blueprint|(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|typecheck|lint|build)(?:\s|$)|(?:^|\s)(?:node|python\d*)\b[^\n]*(?:--test|pytest|unittest)|(?:^|\s)(?:tsc|eslint|vitest|jest|playwright)(?:\s|$)/i.test(failedCommand)
    ? failedCommand
    : null
}

/** Discover a narrow proof only when a named source path maps unambiguously to a test file. */
export function discoverRepositoryRepairProofCommand(
  target: Pick<SignalBoostRepositoryRepairTarget, 'pathHints' | 'failedCommand'> & Partial<Pick<SignalBoostRepositoryRepairTarget, 'failureEvidence'>>,
  availablePaths: readonly string[],
): string | null {
  const explicit = repositoryRepairProofCommand(target)
  if (explicit) return explicit
  const stems = target.pathHints
    .filter(path => /\.(?:[cm]?[jt]sx?)$/i.test(path) && !/\.(?:test|spec)\./i.test(path))
    .map(path => path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase())
    .filter(stem => stem.length >= 5)
  if (!stems.length) return null
  const candidates = [...new Set(availablePaths.map(path => path.replace(/^saas\//, '')))]
    .filter(path => /^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
    .filter(path => stems.some(stem => path.split('/').pop()!.toLowerCase().includes(stem)))
  // Ambiguous matches must not silently choose an unrelated passing suite.
  if (candidates.length !== 1) return null
  return `node --experimental-strip-types --test ${candidates[0]}`
}

// Before a defect is reproduced only reproduction may be written: a regression test, or the lock file
// a dependency install generates. Source stays untouched until a proof has failed on it.
const REPRODUCTION_PATH = /^(?:saas\/)?(?:tests?\/.+|.+\.(?:test|spec)\.[cm]?[jt]sx?|package-lock\.json)$/i
const ANSWER_CONTROL = /"(?:type|action)"\s*:\s*"answer"/i

/**
 * Repository repair verification is a controller responsibility. This adapter makes
 * the exact host-selected proof the first action on the pinned source and the first
 * action after every successful mutation. The model therefore cannot skip the
 * fail-before/change/pass-after cycle by returning prose, diagnostics, or another
 * command. A passing baseline aborts before the model can edit a non-reproducing bug.
 *
 * When the host has no proof (a plain-language owner report that names no failing test,
 * build, or unambiguous source/test pair), the model must reproduce the defect itself:
 * the first test, typecheck, or build it runs that actually fails becomes the pinned
 * proof, and the same controller cycle applies from then on. Until then source edits
 * are refused and an answer ends as not reproduced, so no unrelated passing test can
 * stand in for a reproduction and no repair can be claimed without one.
 */
export function createRepositoryRepairProofController(input: {
  ai: BuilderAiPort
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  proofCommand: string | null
}): RepositoryRepairProofController {
  let proofCommand = normalizedProofCommand(input.proofCommand)
  const hostSelected = proofCommand !== null

  let workspaceGeneration = 0
  let provedGeneration = -1
  let baselineState: 'pending' | 'failed' | 'passed' | 'invalid' = 'pending'

  function assertReproductionWrite(path: string) {
    if (proofCommand || REPRODUCTION_PATH.test(String(path || ''))) return
    throw new Error('builder_regression_proof_required_before_source_edit: run the narrowest test, typecheck, or build that fails on the reported defect first (a new regression test under tests/ may be written to reproduce it); source is edited only after that proof fails')
  }

  const workspace: BuilderWorkspacePort = {
    listFiles: (workspaceId) => input.workspace.listFiles(workspaceId),
    readFile: (workspaceId, path) => input.workspace.readFile(workspaceId, path),
    ...(typeof input.workspace.searchFiles === 'function'
      ? { searchFiles: (workspaceId: string, query: string) => input.workspace.searchFiles!(workspaceId, query) }
      : {}),
    async writeFile(workspaceId, path, content) {
      assertReproductionWrite(path)
      const file = await input.workspace.writeFile(workspaceId, path, content)
      workspaceGeneration += 1
      return file
    },
    async editFile(workspaceId, path, search, replace) {
      assertReproductionWrite(path)
      const file = await input.workspace.editFile(workspaceId, path, search, replace)
      workspaceGeneration += 1
      return file
    },
  }

  const runner: BuilderRunnerPort = {
    async run(runInput) {
      if (!proofCommand) {
        const result = await input.runner.run(runInput)
        const command = String(result.executedCommand || runInput.command || '').trim()
        const policyDenied = result.exitCode === 125
          && String(result.stderr || '').includes('builder_repository_broad_test_blocked')
        // Only an executed test runner, typecheck, or build that fails pins the proof.
        // Diagnostics (git log, ls, node --version) and passing tests are inspection.
        if (result.exitCode !== 0 && !result.timedOut && !policyDenied && isBuilderTestRunnerCommand(command)) {
          proofCommand = command
          provedGeneration = workspaceGeneration
          baselineState = 'failed'
        }
        return result
      }
      const proofRequired = provedGeneration !== workspaceGeneration
      const command = proofRequired ? proofCommand : runInput.command
      const result = await input.runner.run({ ...runInput, command })
      if (proofRequired) {
        provedGeneration = workspaceGeneration
        if (hostSelected && workspaceGeneration === 0) {
          // A host policy refusal (exit 125) never executed the requested proof.
          // It must not authorize a source mutation as though tests failed.
          const policyDenied = result.exitCode === 125
            && String(result.stderr || '').includes('builder_repository_broad_test_blocked')
          baselineState = result.timedOut || policyDenied ? 'invalid' : result.exitCode === 0 ? 'passed' : 'failed'
        }
      }
      return Object.freeze({ ...result, executedCommand: result.executedCommand || command })
    },
  }

  const ai: BuilderAiPort = {
    async generate(request) {
      if (baselineState === 'passed' && workspaceGeneration === 0) throw new Error('builder_regression_not_reproduced')
      if (baselineState === 'invalid' && workspaceGeneration === 0) throw new Error('builder_regression_evidence_required')
      if (proofCommand && provedGeneration !== workspaceGeneration) {
        return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: proofCommand } })
      }
      const response = await input.ai.generate(request)
      if (!proofCommand && ANSWER_CONTROL.test(String(response || ''))) throw new Error('builder_regression_not_reproduced')
      return response
    },
  }

  return Object.freeze({
    ai,
    workspace,
    runner,
    get proofCommand() { return proofCommand },
  })
}
