import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodeRepairPatchProposal, parseUnifiedDiff, validateCodeRepairPatch } from '../lib/code-repair/index.ts'
import type { CodeRepairPlan, CodeRepairValidationCommand, CodeRepairValidationWorkspace } from '../lib/code-repair/index.ts'

const plan: CodeRepairPlan = {
  planId: 'repair-plan:test',
  incidentId: 'incident-1',
  diagnosisFingerprint: 'diagnosis-1',
  problem: 'Type mismatch',
  rationale: 'Evidence points to math.ts.',
  riskLevel: 'low',
  filesToInspect: ['src/math.ts', 'tests/math.test.ts'],
  filesAllowedToModify: ['src/math.ts'],
  testsToRun: ['tests/math.test.ts'],
  steps: [],
  requiresHumanApproval: true,
  patchGenerationAllowed: false,
  patchApplicationAllowed: false,
  mergeAllowed: false,
}

const diff = `--- a/src/math.ts
+++ b/src/math.ts
@@ -1 +1 @@
-export const add = (a:number,b:number) => a - b
+export const add = (a:number,b:number) => a + b
`

test('parses and creates a bounded approval-only patch proposal', () => {
  const files = parseUnifiedDiff(diff)
  assert.equal(files.length, 1)
  assert.equal(files[0].path, 'src/math.ts')
  assert.equal(files[0].additions, 1)
  assert.equal(files[0].deletions, 1)
  const proposal = createCodeRepairPatchProposal(plan, 'abc123', diff)
  assert.equal(proposal.files.length, 1)
  assert.equal(proposal.requiresHumanApproval, true)
  assert.equal(proposal.applicationAllowed, false)
  assert.equal(proposal.mergeAllowed, false)
  assert.equal(proposal.proposalId.startsWith('patch-proposal:'), true)
})

test('rejects out-of-scope, unsafe, and oversized patches', () => {
  assert.throws(() => createCodeRepairPatchProposal(plan, 'abc123', diff.replaceAll('src/math.ts', 'src/other.ts')), /outside the approved scope/)
  assert.throws(() => createCodeRepairPatchProposal({ ...plan, filesAllowedToModify: ['../secret'] }, 'abc123', diff.replaceAll('src/math.ts', '../secret')), /unsafe path/)
  assert.throws(() => createCodeRepairPatchProposal(plan, 'abc123', diff, { maximumChangedLines: 1 }), /changed-line count/)
})

class Workspace implements CodeRepairValidationWorkspace {
  creates = 0
  staged = 0
  runs: string[] = []
  destroys = 0
  constructor(private readonly failAt?: string, private readonly destroyFails = false) {}
  async create() { this.creates++; return { id: 'workspace-1' } }
  async stageUnifiedDiff() { this.staged++ }
  async run(_workspace: { id: string }, command: CodeRepairValidationCommand) {
    this.runs.push(command.id)
    const succeeded = command.id !== this.failAt
    return { commandId: command.id, succeeded, exitCode: succeeded ? 0 : 1, timedOut: false, safeOutput: succeeded ? 'ok' : 'TOKEN=private failure' }
  }
  async destroy() { this.destroys++; if (this.destroyFails) throw new Error('cleanup failure') }
}

test('validates in a disposable workspace and always cleans up', async () => {
  const proposal = createCodeRepairPatchProposal(plan, 'abc123', diff)
  const workspace = new Workspace()
  const commands = [
    { id: 'typecheck', command: 'npm run typecheck', timeoutMs: 100 },
    { id: 'tests', command: 'npm test', timeoutMs: 100 },
  ] as const
  const report = await validateCodeRepairPatch(proposal, workspace, commands)
  assert.equal(report.validated, true)
  assert.equal(report.repositoryModified, false)
  assert.equal(report.networkAccessAllowed, false)
  assert.deepEqual(workspace.runs, ['typecheck', 'tests'])
  assert.equal(workspace.destroys, 1)
})

test('stops after failure, redacts output, and reports cleanup failure', async () => {
  const proposal = createCodeRepairPatchProposal(plan, 'abc123', diff)
  const workspace = new Workspace('typecheck', true)
  const report = await validateCodeRepairPatch(proposal, workspace, [
    { id: 'typecheck', command: 'npm run typecheck', timeoutMs: 100 },
    { id: 'build', command: 'npm run build', timeoutMs: 100 },
  ])
  assert.equal(report.validated, false)
  assert.deepEqual(workspace.runs, ['typecheck'])
  assert.doesNotMatch(report.results[0].safeOutput, /private/)
  assert.equal(report.cleanupSucceeded, false)
  assert.equal(workspace.destroys, 1)
})
