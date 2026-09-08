import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { createRepositoryRepairProofController, repositoryRepairProofCommand } from '../lib/builder/repository-repair-proof-controller.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

class ScriptedAi implements BuilderAiPort {
  calls = 0
  private cursor = 0
  constructor(private readonly controls: readonly string[]) {}
  async generate() {
    this.calls += 1
    return this.controls[this.cursor++] ?? null
  }
}

test('repository proof controller owns fail then edit then pass even when the model never requests a run', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('proof-cycle', 'app.js', 'module.exports = "broken"')
  const proofCommand = 'node --test tests/app.test.js'
  const commands: string[] = []
  const runner: BuilderRunnerPort = {
    async run(input) {
      commands.push(input.command)
      const app = input.files.find(file => file.path === 'app.js')
      return app?.content.includes('fixed')
        ? { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false }
        : { exitCode: 1, stdout: '', stderr: 'AssertionError: expected fixed', timedOut: false }
    },
  }
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"broken","replace":"fixed"}}',
  ])
  const controlled = createRepositoryRepairProofController({ ai: model, workspace, runner, proofCommand })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'fix broken app',
    workspaceId: 'proof-cycle',
    maxRounds: 6,
  })

  assert.equal(result.ok, true)
  assert.equal(model.calls, 1)
  assert.deepEqual(commands, [proofCommand, proofCommand])
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['run', false],
    ['edit_file', true],
    ['run', true],
  ])
  assert.equal((await workspace.readFile('proof-cycle', 'app.js'))?.content, 'module.exports = "fixed"')
})

test('repository proof controller refuses to edit when the pinned baseline already passes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('already-green', 'app.js', 'module.exports = "fixed"')
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"fixed","replace":"changed"}}',
  ])
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false } },
  }
  const controlled = createRepositoryRepairProofController({
    ai: model,
    workspace,
    runner,
    proofCommand: 'node --test tests/app.test.js',
  })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'fix broken app',
    workspaceId: 'already-green',
    maxRounds: 4,
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'builder_regression_not_reproduced')
  assert.equal(model.calls, 0)
  assert.equal((await workspace.readFile('already-green', 'app.js'))?.content, 'module.exports = "fixed"')
})

test('repository proof selection preserves the exact build and narrows explicit failing tests', () => {
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
  }), 'node scripts/vercel-cos-gates.mjs && npm run prebuild && next build')

  assert.equal(repositoryRepairProofCommand({
    pathHints: ['saas/tests/builderToolLoop.node.test.ts'],
    failedCommand: 'npm test',
  }), 'node --experimental-strip-types --test tests/builderToolLoop.node.test.ts')

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
