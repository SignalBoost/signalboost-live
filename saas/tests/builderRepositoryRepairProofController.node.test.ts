// saas/tests/builderRepositoryRepairProofController.node.test.ts
//
// The repository repair proof is host-owned and agent-neutral: the host runs the proof on the untouched revision
// before any model call, source edits wait for a failing proof, and the repair counts only when the host's own proof
// run passes on the final source. The repair lane runs on Builder V2, so these tests drive the real V2 agent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { createRepositoryRepairProofController, discoverRepositoryRepairProofCommand, repositoryRepairProofCommand, type RepositoryRepairProofController } from '../lib/builder/repository-repair-proof-controller.ts'
import { repositoryRepairV2Objective } from '../lib/builder/repository-repair-v2.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

class ScriptedAi implements BuilderAiPort {
  calls = 0
  private cursor = 0
  constructor(private readonly controls: readonly string[]) {}
  async generate() {
    this.calls += 1
    return this.controls[this.cursor++] ?? '{"type":"finish","summary":"done"}'
  }
}

const tool = (action: Record<string, unknown>) => JSON.stringify({ type: 'tool', action })
const finish = (summary = 'Repaired and verified.') => JSON.stringify({ type: 'finish', summary })

async function runAgent(controller: RepositoryRepairProofController, ai: BuilderAiPort, workspaceId: string, objective: string) {
  const agent = new BuilderV2Agent(ai, new BuilderV2Dispatcher(controller.workspace, controller.runner), controller.workspace)
  return agent.run({ workspaceId, objective: repositoryRepairV2Objective(objective, controller.proofCommand), maxSteps: 12, retryDelay: async () => {} })
}

/** A runner over the in-memory workspace: app.js is broken until it says "fixed"; the regression test checks that. */
function appRunner(workspace: InMemoryBuilderWorkspace, workspaceId: string, commands: string[]): BuilderRunnerPort {
  return {
    async run(input) {
      commands.push(input.command)
      if (/broad/.test(input.command)) return { exitCode: 125, stdout: '', stderr: 'builder_repository_broad_test_blocked: use targeted test', timedOut: false }
      if (/passing/.test(input.command)) return { exitCode: 0, stdout: '# pass 1\n# fail 0\n', stderr: '', timedOut: false }
      const app = await workspace.readFile(workspaceId, 'app.js')
      return app?.content.includes('fixed')
        ? { exitCode: 0, stdout: '# pass 1\n# fail 0\n', stderr: '', timedOut: false }
        : { exitCode: 1, stdout: '# pass 0\n# fail 1\n', stderr: 'AssertionError: expected fixed', timedOut: false }
    },
  }
}

test('the host proves the defect before any model call; V2 refuses to finish until the required proof passes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('proof-cycle', 'app.js', 'module.exports = "broken"')
  const proofCommand = 'node --test tests/app.test.js'
  const commands: string[] = []
  const controller = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'proof-cycle', commands), proofCommand })
  const ai = new ScriptedAi([
    tool({ tool: 'edit_file', path: 'app.js', search: 'broken', replace: 'fixed' }),
    finish(),
    tool({ tool: 'run_tests', command: proofCommand }),
    finish(),
  ])

  const baseline = await controller.baseline('proof-cycle')
  assert.equal(baseline.state, 'failed')
  assert.equal(ai.calls, 0, 'no model call before the host baseline')
  const outcome = await runAgent(controller, ai, 'proof-cycle', 'fix broken app')
  assert.equal(outcome.ok, true, outcome.reason)
  const final = await controller.finalProof('proof-cycle')
  assert.equal(final.passed, true)
  assert.equal(commands[0], proofCommand)
  // Baseline, the agent's own run (its finish was refused until the required proof passed), the final host proof.
  assert.deepEqual(commands, [proofCommand, proofCommand, proofCommand])
  assert.equal((await workspace.readFile('proof-cycle', 'app.js'))?.content, 'module.exports = "fixed"')
})

test('a passing baseline ends the repair as not reproduced and source stays untouched', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('already-green', 'app.js', 'module.exports = "fixed"')
  const controller = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'already-green', []), proofCommand: 'node --test tests/app.test.js' })
  assert.equal((await controller.baseline('already-green')).state, 'passed')
  await assert.rejects(controller.workspace.editFile('already-green', 'app.js', 'fixed', 'changed'), /builder_regression_proof_required_before_source_edit/)
})

test('a policy-blocked broad proof is not evidence and cannot unlock source edits', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('blocked-proof', 'app.js', 'module.exports = "unchanged"')
  const controller = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'blocked-proof', []), proofCommand: 'npm run broad' })
  assert.equal((await controller.baseline('blocked-proof')).state, 'invalid')
  await assert.rejects(controller.workspace.editFile('blocked-proof', 'app.js', 'unchanged', 'changed'), /builder_regression_proof_required_before_source_edit/)
  assert.equal((await workspace.readFile('blocked-proof', 'app.js'))?.content, 'module.exports = "unchanged"')
})

test('without a host proof the agent reproduces with its own failing test, then fail, edit, pass', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('own-proof', 'app.js', 'module.exports = "broken"')
  const commands: string[] = []
  const controller = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'own-proof', commands), proofCommand: null })
  assert.equal((await controller.baseline('own-proof')).state, 'pending')
  await assert.rejects(controller.workspace.editFile('own-proof', 'app.js', 'broken', 'fixed'), /builder_regression_proof_required_before_source_edit/)
  const ai = new ScriptedAi([
    tool({ tool: 'write_file', path: 'tests/app.test.js', content: 'test("app", () => {})' }),
    tool({ tool: 'run_tests', command: 'node --test tests/app.test.js' }),
    tool({ tool: 'edit_file', path: 'app.js', search: 'broken', replace: 'fixed' }),
    tool({ tool: 'run_tests', command: 'node --test tests/app.test.js' }),
    finish(),
  ])
  const outcome = await runAgent(controller, ai, 'own-proof', 'fix broken app')
  assert.equal(outcome.ok, true, outcome.reason)
  assert.equal(controller.proofCommand, 'node --test tests/app.test.js')
  assert.equal(controller.state().baseline, 'failed')
  assert.equal((await controller.finalProof('own-proof')).passed, true)
})

test('without a host proof a passing test never stands in for reproduction', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('no-repro', 'app.js', 'module.exports = "broken"')
  const controller = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'no-repro', []), proofCommand: null })
  await controller.runner.run({ workspaceId: 'no-repro', command: 'node --test tests/passing.test.js', files: [] })
  await controller.runner.run({ workspaceId: 'no-repro', command: 'npm run broad', files: [] })
  assert.equal(controller.proofCommand, null)
  await assert.rejects(controller.workspace.editFile('no-repro', 'app.js', 'broken', 'fixed'), /builder_regression_proof_required_before_source_edit/)
  // The lane reports a repair only on a passing final proof; with no proof there is none.
  assert.deepEqual(await controller.finalProof('no-repro'), { passed: false, result: null })
})

test('the proof state survives a work slice: a resumed controller keeps the failing baseline and its command', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('resume', 'app.js', 'module.exports = "broken"')
  const commands: string[] = []
  const first = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'resume', commands), proofCommand: 'node --test tests/app.test.js' })
  await first.baseline('resume')
  const saved = JSON.parse(JSON.stringify(first.state()))
  const resumed = createRepositoryRepairProofController({ workspace, runner: appRunner(workspace, 'resume', commands), proofCommand: null, state: saved })
  assert.deepEqual(resumed.state(), { proofCommand: 'node --test tests/app.test.js', hostSelected: true, baseline: 'failed' })
  assert.deepEqual(await resumed.baseline('resume'), { state: 'failed', result: null }, 'a resumed baseline is not run again')
  await resumed.workspace.editFile('resume', 'app.js', 'broken', 'fixed')
  assert.equal((await resumed.finalProof('resume')).passed, true)
  assert.equal(commands.length, 2)
})

test('repository proof selection preserves the exact build and narrows explicit failing tests', () => {
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
  }), 'node scripts/vercel-cos-gates.mjs && npm run prebuild && npm exec -- next build')

  assert.equal(repositoryRepairProofCommand({
    pathHints: ['saas/tests/builderToolLoop.node.test.ts'],
    failedCommand: 'npm test',
  }), 'node --experimental-transform-types --test tests/builderToolLoop.node.test.ts')

  assert.equal(repositoryRepairProofCommand({ pathHints: [], failedCommand: 'npm test' }), null)
  assert.equal(repositoryRepairProofCommand({ pathHints: ['saas/tests/builderV2NewProjectHandoff.node.test.ts'], failedCommand: 'npm test' }), 'node --experimental-transform-types --test tests/builderV2NewProjectHandoff.node.test.ts')
  assert.equal(repositoryRepairProofCommand({ pathHints: [], failedCommand: 'git log --oneline -15' }), null)
})

test('operator narration never calls a failed diagnostic command a reproduced defect', () => {
  const diagnosticOnly = formatBuilderOperatorRepairReply({
    ok: false,
    error: 'builder_regression_evidence_required',
    trace: [{
      round: 1,
      toolId: 'run',
      ok: false,
      command: 'git log --oneline -15 -- lib/ai/cos/cosUniversityAdmissionRunner.ts',
      exitCode: 1,
      failureClass: 'unknown',
    }],
  })
  assert.doesNotMatch(diagnosticOnly, /reproduced the reported failure/i)
  assert.match(diagnosticOnly, /repair gate remains unsatisfied/i)

  const realProof = formatBuilderOperatorRepairReply({
    ok: false,
    error: 'builder_regression_evidence_required',
    trace: [{
      round: 1,
      toolId: 'run',
      ok: false,
      command: 'npm run build',
      exitCode: 1,
      failureClass: 'deployment',
    }],
  })
  assert.match(realProof, /reproduced the reported failure/i)
})

test('proof discovery chooses a unique test related to explicitly named source', () => {
  const target = { pathHints: ['saas/lib/builder/project-continuity.ts'], failedCommand: 'npm test' }
  assert.equal(discoverRepositoryRepairProofCommand(target, [
    'tests/agentGateway.node.test.ts',
    'tests/project-continuity.test.ts',
  ]), 'node --experimental-transform-types --test tests/project-continuity.test.ts')
  assert.equal(discoverRepositoryRepairProofCommand({ pathHints: [], failedCommand: 'npm test' }, [
    'tests/agentGateway.node.test.ts',
  ]), null)
  assert.equal(discoverRepositoryRepairProofCommand(target, [
    'tests/project-continuity.test.ts', 'tests/project-continuity.other.test.ts',
  ]), null)
})

test('repository repair selects a single literal failing test from recorded CI evidence', () => {
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'npm test',
    failureEvidence: ['FAIL saas/tests/platformObservability.node.test.ts: expected valid trace'],
  }), 'node --experimental-transform-types --test tests/platformObservability.node.test.ts')
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'npm test',
    failureEvidence: ['FAIL tests/first.node.test.ts and tests/second.node.test.ts'],
  }), null)
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'npm test',
    failureEvidence: ['FAIL tests/../unsafe.node.test.ts'],
  }), null)
})

test('deployed engineering repairs with recorded failing tests cannot bypass the host proof controller', () => {
  const source = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.match(source, /const engineeringRepair = engineeringTask/)
  assert.match(source, /target\.pathHints\.some\(path =>/)
  assert.match(source, /target\.failureEvidence\.some\(line =>/)
  assert.match(source, /const needsRepairProof = resumeState \? resumeState\.proof !== null : !engineeringTask \|\| engineeringRepair/)
  assert.match(source, /const proofController = needsRepairProof \? createRepositoryRepairProofController/)
  assert.match(source, /proofController\?\.runner \?\? repositoryRunner/)
})

test('deployed engineering repair honors test paths in failure evidence, not only path hints', () => {
  const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.match(repair, /target\.failureEvidence\.some\(line => \/\(\?:saas/)
  assert.match(repair, /const needsRepairProof = resumeState \? resumeState\.proof !== null : !engineeringTask \|\| engineeringRepair/)
  assert.match(repair, /const proofController = needsRepairProof \? createRepositoryRepairProofController/)
})
