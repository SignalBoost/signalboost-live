import type { CodeRepairPatchProposal, CodeRepairPatchValidationReport, CodeRepairValidationCommand, CodeRepairValidationWorkspace } from './patch-contracts.ts'

const DEFAULT_COMMANDS: readonly CodeRepairValidationCommand[] = Object.freeze([
  Object.freeze({ id: 'typecheck', command: 'npm run typecheck', timeoutMs: 120_000 }),
  Object.freeze({ id: 'targeted-tests', command: 'npm run test:agent-repair-controller', timeoutMs: 120_000 }),
  Object.freeze({ id: 'build', command: 'npm run build', timeoutMs: 180_000 }),
])

function safeOutput(value: string): string {
  return value
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, '[REDACTED]')
    .slice(0, 8_000)
}

export async function validateCodeRepairPatch(
  proposal: CodeRepairPatchProposal,
  workspaceProvider: CodeRepairValidationWorkspace,
  commands: readonly CodeRepairValidationCommand[] = DEFAULT_COMMANDS,
): Promise<CodeRepairPatchValidationReport> {
  if (proposal.applicationAllowed || proposal.mergeAllowed) throw new Error('Patch validation requires a proposal that cannot apply or merge itself.')
  const workspace = await workspaceProvider.create({ workspaceId: proposal.proposalId, baseCommitSha: proposal.baseCommitSha })
  const results = [] as CodeRepairPatchValidationReport['results'][number][]
  let cleanupSucceeded = false
  try {
    await workspaceProvider.stageUnifiedDiff(workspace, proposal.unifiedDiff)
    for (const command of commands) {
      if (!command.id.trim() || !command.command.trim() || !Number.isSafeInteger(command.timeoutMs) || command.timeoutMs <= 0) throw new Error('Invalid patch validation command.')
      const result = await workspaceProvider.run(workspace, command)
      results.push(Object.freeze({ ...result, safeOutput: safeOutput(result.safeOutput) }))
      if (!result.succeeded) break
    }
  } finally {
    try { await workspaceProvider.destroy(workspace); cleanupSucceeded = true } catch { cleanupSucceeded = false }
  }
  return Object.freeze({
    proposalId: proposal.proposalId,
    validated: results.length === commands.length && results.every(result => result.succeeded) && cleanupSucceeded,
    results: Object.freeze(results),
    cleanupSucceeded,
    repositoryModified: false,
    networkAccessAllowed: false,
  })
}
