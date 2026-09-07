import { normalizeBuilderSandboxCommand } from './project-context.ts'
import type { SignalBoostRepositoryRepairFreshness } from './repository-repair-freshness.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'

export type SupersededRepositoryRepairReplan = Readonly<{
  target: SignalBoostRepositoryRepairTarget
  objective: string
  proofCommand: string | null
  reportedCommitSha: string
  currentBranchHeadSha: string
}>

function failingTestPaths(target: SignalBoostRepositoryRepairTarget): readonly string[] {
  return Object.freeze(target.pathHints
    .map(path => path.replace(/^saas\//, ''))
    .filter(path => /^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
    .slice(0, 4))
}

/**
 * Choose the narrowest host-controlled proof for a stale build before the Software Specialist lets
 * Builder edit the current branch head. This is deterministic orchestration, not model reasoning.
 */
export function repositoryRepairRevalidationProofCommand(target: SignalBoostRepositoryRepairTarget): string | null {
  const failingTests = failingTestPaths(target)
  if (failingTests.length) return `node --experimental-strip-types --test ${failingTests.join(' ')}`
  const command = String(target.failedCommand || '').trim()
  return command ? normalizeBuilderSandboxCommand(command) : null
}

/**
 * A branch advance is a replanning event, not an instruction to hand work back to the user.
 *
 * The old failure remains evidence, but execution authority is repinned to the verified current
 * head. A synthetic current clone identity is prepended so the normal repository-repair parser and
 * Builder runner cannot accidentally remount the superseded revision from the historical log.
 */
export function replanSupersededRepositoryRepair(
  freshness: SignalBoostRepositoryRepairFreshness,
  objective: string,
): SupersededRepositoryRepairReplan | null {
  if (freshness.status !== 'superseded') return null
  const currentBranchHeadSha = String(freshness.currentBranchHeadSha || '').toLowerCase()
  const reportedCommitSha = String(freshness.reportedCommitSha || '').toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(currentBranchHeadSha) || !/^[0-9a-f]{40}$/.test(reportedCommitSha)) return null

  const target = Object.freeze({
    ...freshness.target,
    commitSha: currentBranchHeadSha,
    fullCommitSha: currentBranchHeadSha,
  })
  const revalidationHeader = [
    '[Software Specialist current-head revalidation]',
    `The supplied failure was observed at ${reportedCommitSha} on ${target.branch}.`,
    `That branch advanced to ${currentBranchHeadSha}. The Software Specialist owns continuation of the software task.`,
    'Reproduce the same failure on this verified current head before any edit. If the proof already passes, make no code change and report that the current head superseded the failure.',
    `Cloning github.com/SignalBoost/signalboost-live (Branch: ${target.branch}, Commit: ${currentBranchHeadSha})`,
  ].join('\n')

  return Object.freeze({
    target,
    objective: `${revalidationHeader}\n\n${String(objective || '').trim()}`.trim(),
    proofCommand: repositoryRepairRevalidationProofCommand(target),
    reportedCommitSha,
    currentBranchHeadSha,
  })
}
