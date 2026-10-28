import type { BuilderRunResult, BuilderRunnerPort, BuilderWorkspacePort } from './contracts.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { isBuilderTestRunnerCommand } from './regression-gate.ts'
import { builderNodeTestCommand } from './node-test-command.ts'

export type RepositoryRepairProofBaseline = 'pending' | 'failed' | 'passed' | 'invalid'

/** What the controller knows about the proof, carried across work slices in the job checkpoint. */
export type RepositoryRepairProofState = Readonly<{
  proofCommand: string | null
  hostSelected: boolean
  baseline: RepositoryRepairProofBaseline
}>

export type RepositoryRepairProofController = Readonly<{
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  readonly proofCommand: string | null
  /** Runs the host-selected proof on the untouched revision once; a pinned or already-run proof is not run again. */
  baseline(workspaceId: string): Promise<Readonly<{ state: RepositoryRepairProofBaseline; result: BuilderRunResult | null }>>
  /** Runs the proof on the current source. A repair is proven only when this passes after the last change. */
  finalProof(workspaceId: string): Promise<Readonly<{ passed: boolean; result: BuilderRunResult | null }>>
  state(): RepositoryRepairProofState
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
  if (failingTests.length) return builderNodeTestCommand(failingTests.join(' '))

  // Provider/CI failure excerpts often name the failing test but omit it from
  // structured pathHints. Extract only literal test paths, never shell syntax.
  // An ambiguous set is deliberately not selected as a proof.
  const evidenceText = Array.isArray(target.failureEvidence) ? target.failureEvidence.join('\n') : ''
  const evidenceTests = [...new Set(
    [...evidenceText.matchAll(/(?:saas\/)?tests?\/[A-Za-z0-9_.\/-]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)/g)]
      .map(match => match[0].replace(/^saas\//, ''))
      .filter(path => !path.includes('..'))
  )]
  if (evidenceTests.length === 1) return builderNodeTestCommand(evidenceTests[0])


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
  return builderNodeTestCommand(candidates[0])
}

// Before a defect is reproduced only reproduction may be written: a regression test, or the lock file
// a dependency install generates. Source stays untouched until a proof has failed on it.
const REPRODUCTION_PATH = /^(?:saas\/)?(?:tests?\/.+|.+\.(?:test|spec)\.[cm]?[jt]sx?|package-lock\.json)$/i

function policyDenied(result: BuilderRunResult): boolean {
  return result.exitCode === 125 && String(result.stderr || '').includes('builder_repository_broad_test_blocked')
}

/**
 * Repository repair proof is a host responsibility, independent of the agent driving the repair. The host runs the
 * selected proof on the pinned revision before any model call: a passing baseline ends the repair as not reproduced
 * (nothing to fix, nothing spent), an inconclusive one (timeout, sandbox policy refusal) as missing evidence. Source
 * may be edited only after the proof has failed, and the repair counts only when the same proof, run by the host on
 * the final source, passes.
 *
 * When the host has no proof (a plain-language owner report that names no failing test, build, or unambiguous
 * source/test pair), the agent must reproduce the defect itself: the first test, typecheck, or build it runs that
 * actually fails becomes the pinned proof. Until then source edits are refused, so no unrelated passing test can stand
 * in for a reproduction and no repair can be claimed without one.
 *
 * The state survives work slices: the job stores `state()` in its checkpoint and passes it back on resume.
 */
export function createRepositoryRepairProofController(input: {
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  proofCommand: string | null
  state?: RepositoryRepairProofState | null
}): RepositoryRepairProofController {
  let proofCommand = input.state ? input.state.proofCommand : normalizedProofCommand(input.proofCommand)
  const hostSelected = input.state ? input.state.hostSelected : proofCommand !== null
  let baselineState: RepositoryRepairProofBaseline = input.state?.baseline ?? 'pending'

  function assertReproductionWrite(path: string) {
    if (REPRODUCTION_PATH.test(String(path || ''))) return
    if (proofCommand && baselineState === 'failed') return
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
      return input.workspace.writeFile(workspaceId, path, content)
    },
    async editFile(workspaceId, path, search, replace) {
      assertReproductionWrite(path)
      return input.workspace.editFile(workspaceId, path, search, replace)
    },
  }

  const runner: BuilderRunnerPort = {
    stagesWorkspaceFiles: input.runner.stagesWorkspaceFiles,
    async run(runInput) {
      const result = await input.runner.run(runInput)
      if (!proofCommand) {
        const command = String(result.executedCommand || runInput.command || '').trim()
        // Only an executed test runner, typecheck, or build that fails pins the proof.
        // Diagnostics (git log, ls, node --version) and passing tests are inspection.
        if (result.exitCode !== 0 && !result.timedOut && !policyDenied(result) && isBuilderTestRunnerCommand(command)) {
          proofCommand = command
          baselineState = 'failed'
        }
      }
      return result
    },
  }

  return Object.freeze({
    workspace,
    runner,
    get proofCommand() { return proofCommand },
    async baseline(workspaceId: string) {
      if (!proofCommand || baselineState !== 'pending') return { state: baselineState, result: null }
      const result = await input.runner.run({ workspaceId, command: proofCommand, files: [] })
      // A host policy refusal (exit 125) or a timeout never executed the proof: it is not evidence either way.
      baselineState = result.timedOut || policyDenied(result) ? 'invalid' : result.exitCode === 0 ? 'passed' : 'failed'
      return { state: baselineState, result }
    },
    async finalProof(workspaceId: string) {
      if (!proofCommand) return { passed: false, result: null }
      const result = await input.runner.run({ workspaceId, command: proofCommand, files: [] })
      return { passed: result.exitCode === 0 && !result.timedOut, result }
    },
    state: () => Object.freeze({ proofCommand, hostSelected, baseline: baselineState }),
  })
}
