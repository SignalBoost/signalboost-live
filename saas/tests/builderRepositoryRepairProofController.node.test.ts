import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { createRepositoryRepairProofController, discoverRepositoryRepairProofCommand, repositoryRepairProofCommand } from '../lib/builder/repository-repair-proof-controller.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import type { BuilderAiPort, BuilderBrowserCliPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

class ScriptedAi implements BuilderAiPort {
  calls = 0
  private cursor = 0
  private readonly controls: readonly string[]
  constructor(controls: readonly string[]) {
    this.controls = controls
  }
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

test('policy-blocked broad proof cannot authorize repository source edits', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('blocked-proof', 'app.js', 'module.exports = "unchanged"')
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"unchanged","replace":"changed"}}',
  ])
  const controlled = createRepositoryRepairProofController({
    ai: model, workspace, proofCommand: 'npm test',
    runner: { async run() {
      return { exitCode: 125, stdout: '',
        stderr: 'builder_repository_broad_test_blocked: use targeted test', timedOut: false }
    } },
  })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'Fix a failing repository test', workspaceId: 'blocked-proof', maxRounds: 5,
  })
  assert.equal(result.ok, false)
  assert.equal(model.calls, 0)
  assert.equal((await workspace.readFile('blocked-proof', 'app.js'))?.content, 'module.exports = "unchanged"')
  assert.equal(result.trace.some(item => item.ok && item.toolId === 'edit_file'), false)
})

test('repository proof selection preserves the exact build and narrows explicit failing tests', () => {
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
  }), 'node scripts/vercel-cos-gates.mjs && npm run prebuild && npm exec -- next build')

  assert.equal(repositoryRepairProofCommand({
    pathHints: ['saas/tests/builderToolLoop.node.test.ts'],
    failedCommand: 'npm test',
  }), 'node --experimental-strip-types --test tests/builderToolLoop.node.test.ts')

  assert.equal(repositoryRepairProofCommand({ pathHints: [], failedCommand: 'npm test' }), null)
  assert.equal(repositoryRepairProofCommand({ pathHints: ['saas/tests/builderV2NewProjectHandoff.node.test.ts'], failedCommand: 'npm test' }), 'node --experimental-strip-types --test tests/builderV2NewProjectHandoff.node.test.ts')
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

test('Playwright evidence cannot replace repository fail-before-edit-pass-after proof', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('browser-proof', 'app.js', 'module.exports = "broken"')
  const proofCommand = 'node --test tests/app.test.js'
  let runs = 0
  const runner: BuilderRunnerPort = {
    async run(input) {
      runs += 1
      const app = input.files.find(file => file.path === 'app.js')
      return app?.content.includes('fixed')
        ? { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false }
        : { exitCode: 1, stdout: '', stderr: 'AssertionError: expected fixed', timedOut: false }
    },
  }
  const browserCalls: string[] = []
  const browser: BuilderBrowserCliPort = {
    async capabilities() {
      return { actions: ['snapshot'], allowedOrigins: ['https://itmounts.com'] }
    },
    async invoke(input) {
      browserCalls.push(input.action)
      return {
        ok: true,
        action: input.action,
        exitCode: 0,
        stdout: '### Page\n- Page URL: https://itmounts.com/\n- Page Title: iTMounts',
        stderr: '',
        timedOut: false,
      }
    },
    async close() {},
  }
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"browser_cli","input":{"action":"snapshot"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"broken","replace":"fixed"}}',
  ])
  const controlled = createRepositoryRepairProofController({ ai: model, workspace, runner, proofCommand })
  const result = await new BuilderToolLoop(
    controlled.ai,
    controlled.workspace,
    controlled.runner,
    undefined,
    browser,
  ).run({
    objective: 'fix broken app and inspect browser evidence',
    workspaceId: 'browser-proof',
    maxRounds: 8,
  })

  assert.equal(result.ok, true)
  assert.equal(runs, 2)
  assert.deepEqual(browserCalls, ['snapshot'])
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['run', false],
    ['browser_cli', true],
    ['edit_file', true],
    ['run', true],
  ])
})


test('proof discovery chooses a unique test related to explicitly named source', () => {
  const target = { pathHints: ['saas/lib/builder/project-continuity.ts'], failedCommand: 'npm test' }
  assert.equal(discoverRepositoryRepairProofCommand(target, [
    'tests/agentGateway.node.test.ts',
    'tests/project-continuity.test.ts',
  ]), 'node --experimental-strip-types --test tests/project-continuity.test.ts')
  assert.equal(discoverRepositoryRepairProofCommand({ pathHints: [], failedCommand: 'npm test' }, [
    'tests/agentGateway.node.test.ts',
  ]), null)
  assert.equal(discoverRepositoryRepairProofCommand(target, [
    'tests/project-continuity.test.ts', 'tests/project-continuity.other.test.ts',
  ]), null)
})

test('without a host proof Builder reproduces with its own failing regression test, then fail edit pass', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('discover', 'lib/app.js', 'module.exports = "broken"')
  const commands: string[] = []
  const runner: BuilderRunnerPort = {
    async run(input) {
      commands.push(input.command)
      if (input.command.startsWith('git ')) return { exitCode: 128, stdout: '', stderr: 'fatal: bad revision', timedOut: false }
      const app = input.files.find(file => file.path === 'lib/app.js')
      return app?.content.includes('fixed')
        ? { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false }
        : { exitCode: 1, stdout: '', stderr: 'AssertionError: expected fixed', timedOut: false }
    },
  }
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"run","input":{"command":"git log --oneline -3 -- lib/app.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"lib/app.js","search":"broken","replace":"guess"}}',
    '{"type":"tool","toolId":"write_file","input":{"path":"tests/app.test.js","content":"require(\\"node:assert\\").equal(require(\\"../lib/app.js\\"),\\"fixed\\")"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node --test tests/app.test.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"lib/app.js","search":"broken","replace":"fixed"}}',
    '{"type":"answer","answer":"fixed lib/app.js"}',
  ])
  const controlled = createRepositoryRepairProofController({ ai: model, workspace, runner, proofCommand: null })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'the app is broken, fix it', workspaceId: 'discover', maxRounds: 12,
  })

  assert.equal(result.ok, true)
  assert.equal(controlled.proofCommand, 'node --test tests/app.test.js')
  const guess = result.trace.find(item => item.toolId === 'edit_file' && item.input.replace === 'guess')
  assert.equal(guess?.ok, false)
  assert.match(String(guess?.error), /builder_regression_proof_required_before_source_edit/)
  assert.equal(commands[0], 'git log --oneline -3 -- lib/app.js')
  assert.deepEqual(commands.slice(-2), ['node --test tests/app.test.js', 'node --test tests/app.test.js'])
  assert.equal((await workspace.readFile('discover', 'lib/app.js'))?.content, 'module.exports = "fixed"')
})

test('without a host proof a passing test never stands in for reproduction and an answer ends not reproduced', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('green', 'lib/app.js', 'module.exports = "fixed"')
  await workspace.writeFile('green', 'tests/other.test.js', 'ok')
  const runner: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false } } }
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"run","input":{"command":"node --test tests/other.test.js"}}',
    '{"type":"answer","answer":"all good, fixed"}',
  ])
  const controlled = createRepositoryRepairProofController({ ai: model, workspace, runner, proofCommand: null })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'the app is broken, fix it', workspaceId: 'green', maxRounds: 6,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'builder_regression_not_reproduced')
  assert.equal(controlled.proofCommand, null)
  assert.ok(result.trace.some(item => item.toolId === 'run' && item.ok))
  assert.equal((await workspace.readFile('green', 'lib/app.js'))?.content, 'module.exports = "fixed"')
})

test('without a host proof a policy-blocked broad suite does not pin a proof or unlock source edits', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('broad', 'lib/app.js', 'module.exports = "unchanged"')
  const runner: BuilderRunnerPort = { async run() {
    return { exitCode: 125, stdout: '', stderr: 'builder_repository_broad_test_blocked: use targeted test', timedOut: false }
  } }
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"run","input":{"command":"npm test"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"lib/app.js","search":"unchanged","replace":"changed"}}',
  ])
  const controlled = createRepositoryRepairProofController({ ai: model, workspace, runner, proofCommand: null })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'Fix the broken app', workspaceId: 'broad', maxRounds: 4,
  })
  assert.equal(result.ok, false)
  assert.equal(controlled.proofCommand, null)
  assert.equal(result.trace.some(item => item.ok && item.toolId === 'edit_file'), false)
  assert.equal((await workspace.readFile('broad', 'lib/app.js'))?.content, 'module.exports = "unchanged"')
})

test('production 2026-10-15: blocked npm test plus an unrelated passing test continues to a reproduced repair', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('prod', 'lib/app.js', 'module.exports = "broken"')
  await workspace.writeFile('prod', 'tests/agentGateway.node.test.ts', 'ok')
  await workspace.writeFile('prod', 'tests/cosRouter.node.test.ts', 'ok')
  await workspace.writeFile('prod', 'tests/pressMedia.node.test.ts', 'ok')
  await workspace.writeFile('prod', 'package.json', '{"scripts":{"test":"node --experimental-strip-types --test tests/*.test.ts"}}')
  const runner: BuilderRunnerPort = {
    async run(input) {
      if (input.command === 'npm test') return { exitCode: 125, stdout: '', stderr: 'builder_repository_broad_test_blocked: select the smallest relevant test file and run it directly', timedOut: false }
      if (input.command.includes('agentGateway')) return { exitCode: 0, stdout: 'pass 9\n', stderr: '', timedOut: false }
      const app = input.files.find(file => file.path === 'lib/app.js')
      return app?.content.includes('fixed')
        ? { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false }
        : { exitCode: 1, stdout: '', stderr: 'AssertionError: expected fixed', timedOut: false }
    },
  }
  const model = new ScriptedAi([
    '{"type":"tool","toolId":"list_files","input":{}}',
    '{"type":"tool","toolId":"run","input":{"command":"npm test"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node --test tests/agentGateway.node.test.ts"}}',
    '{"type":"tool","toolId":"write_file","input":{"path":"tests/app.test.js","content":"require(\\"node:assert\\").equal(require(\\"../lib/app.js\\"),\\"fixed\\")"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node --test tests/app.test.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"lib/app.js","search":"broken","replace":"fixed"}}',
    '{"type":"answer","answer":"fixed lib/app.js"}',
  ])
  const controlled = createRepositoryRepairProofController({ ai: model, workspace, runner, proofCommand: null })
  const result = await new BuilderToolLoop(controlled.ai, controlled.workspace, controlled.runner).run({
    objective: 'the app is broken, fix it', workspaceId: 'prod', maxRounds: 14,
  })
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  assert.equal(controlled.proofCommand, 'node --test tests/app.test.js')
  assert.equal((await workspace.readFile('prod', 'lib/app.js'))?.content, 'module.exports = "fixed"')
})

test('deployed engineering repairs with recorded failing tests cannot bypass the host proof controller', () => {
  const source = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.match(source, /const engineeringRepair = engineeringTask/)
  assert.match(source, /target\.pathHints\.some\(path =>/)
  assert.match(source, /target\.failureEvidence\.some\(line =>/)
  assert.match(source, /const needsRepairProof = !engineeringTask \|\| engineeringRepair/)
  assert.match(source, /const proofController = needsRepairProof \? createRepositoryRepairProofController/)
  assert.match(source, /proofController\?\.runner \?\? repositoryRunner/)
})

test('repository repair selects a single literal failing test from recorded CI evidence', () => {
  assert.equal(repositoryRepairProofCommand({
    pathHints: [],
    failedCommand: 'npm test',
    failureEvidence: ['FAIL saas/tests/platformObservability.node.test.ts: expected valid trace'],
  }), 'node --experimental-strip-types --test tests/platformObservability.node.test.ts')
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
