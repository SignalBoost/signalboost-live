import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderV2Agent, builderV2ProgressReport } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { builderFailurePaths, builderFailureImports } from '../lib/builder/failure-context.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'

const objective = 'Create:\npackage.json\ncli.js\nsrc/service.js\ntest/service.test.js\n## Mandatory verification\n```bash\nnpm test\nnode cli.js\n```'
const cli = "const { create } = require('./src/service')\nconsole.log(create().total.toFixed(2))\n"
const service = 'function create() { return { totals: { total: 1250 } } }\nmodule.exports = { create }\n'
async function setup() {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'package.json', '{"scripts":{"test":"node --test test/*.test.js"}}')
  // These files crowd the old fallback working set ahead of the actual entrypoint.
  await workspace.writeFile('w', 'src/aaa.js', '// ' + 'x'.repeat(9000))
  await workspace.writeFile('w', 'src/bbb.js', '// ' + 'x'.repeat(2900))
  await workspace.writeFile('w', 'src/service.js', service)
  await workspace.writeFile('w', 'cli.js', cli)
  await workspace.writeFile('w', 'test/service.test.js', "const { create } = require('../src/service')\n")
  return workspace
}
function runner(commands: string[]): BuilderRunnerPort {
  return { async run({ command, files }) {
    commands.push(command)
    const broken = files.find(file => file.path === 'cli.js')!.content.includes('create().total.')
    return command === 'node cli.js' && broken
      ? { exitCode: 1, timedOut: false, stdout: '', stderr: '/tmp/build/cli.js:2\nconsole.log(create().total.toFixed(2))\nTypeError: Cannot read properties of undefined (reading toFixed)\n    at run (/tmp/build/cli.js:2:29)' }
      : { exitCode: 0, timedOut: false, stdout: command === 'npm test' ? '# pass 1\n# fail 0' : '1250.00', stderr: '' }
  } }
}

test('runtime repair receives entrypoint and its real imports in the first remaining model call', async () => {
  const workspace = await setup()
  const commands: string[] = []
  let calls = 0
  const agent = new BuilderV2Agent({ async generate({ prompt }) {
    calls++
    const context = JSON.parse(prompt)
    assert.equal(context.openFiles['cli.js'], cli)
    assert.equal(context.openFiles['src/service.js'], service)
    assert.match(context.latestFailedTest, /Cannot read properties/)
    return JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'cli.js', search: 'create().total.', replace: 'create().totals.total.' } })
  } }, new BuilderV2Dispatcher(workspace, runner(commands)), workspace)
  const result = await agent.run({ workspaceId: 'w', objective, modelCallBudget: 1 })
  assert.equal(result.ok, true, result.reason + ': ' + result.summary)
  assert.equal(calls, 1)
  assert.deepEqual(commands, ['npm test', 'node cli.js', 'node cli.js', 'npm test'])
})

test('runtime failure context survives checkpoint resume without new read calls', async () => {
  const workspace = await setup()
  const commands: string[] = []
  const dispatcher = new BuilderV2Dispatcher(workspace, runner(commands))
  const paused = await new BuilderV2Agent({ async generate() {
    return JSON.stringify({ type: 'tool', action: { tool: 'read_file', path: 'package.json' } })
  } }, dispatcher, workspace).run({ workspaceId: 'w', objective, maxSteps: 1, modelCallBudget: 2 })
  assert.ok(paused.checkpoint)
  const resumed = await new BuilderV2Agent({ async generate({ prompt }) {
    const context = JSON.parse(prompt)
    assert.equal(context.openFiles['cli.js'], cli)
    assert.equal(context.openFiles['src/service.js'], service)
    return JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'cli.js', search: 'create().total.', replace: 'create().totals.total.' } })
  } }, dispatcher, workspace).run({ workspaceId: 'w', objective, checkpoint: paused.checkpoint, modelCallBudget: 2 })
  assert.equal(resumed.ok, true, resumed.reason + ': ' + resumed.summary)
  assert.equal(resumed.checkpoint?.modelCalls, 2)
})

test('progress retains the exception line before a long Node stack and stdout', () => {
  const report = builderV2ProgressReport('Run node cli.js', [], [{ tool: 'run_tests', ok: false, changed: false,
    output: { requestedCommand: 'node cli.js', exitCode: 1, timedOut: false,
      stderr: 'TypeError: Cannot read properties of undefined\n' + '    at internal/frame.js:1:1\n'.repeat(30), stdout: 'Demo\n'.repeat(20) } }])
  assert.match(report, /TypeError: Cannot read properties of undefined/)
})

test('diagnostic paths stay inside the workspace and support Windows stacks and silent runtime exits', async () => {
  const files = ['cli.js', 'src/service.js']
  assert.deepEqual(builderFailurePaths('node cli.js', 'at C:\\build\\src\\service.js:4:2\n at /etc/secret.js:1:1', files),
    ['src/service.js', 'cli.js'])
  assert.deepEqual(builderFailurePaths('node cli.js', '', files), ['cli.js'])
  assert.deepEqual(builderFailurePaths('node other-cli.js', 'at /tmp/other-cli.js:1:1', files), [])
  const workspace = await setup()
  await workspace.writeFile('w', 'cli.js', "require('/etc/passwd'); require('./absent'); require('./src/service')")
  assert.deepEqual(await builderFailureImports(workspace, 'w', ['cli.js'], files), ['src/service.js'])
})

test('unchanged runtime failure cannot become verified or buy another model call', async () => {
  const workspace = await setup()
  const commands: string[] = []
  const result = await new BuilderV2Agent({ async generate() {
    return JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/service.js', search: '1250', replace: '1300' } })
  } }, new BuilderV2Dispatcher(workspace, runner(commands)), workspace)
    .run({ workspaceId: 'w', objective, modelCallBudget: 1 })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'builder_v2_model_call_budget_exhausted')
  assert.equal(result.checkpoint?.modelCalls, 1)
  assert.deepEqual(commands, ['npm test', 'node cli.js', 'node cli.js'])
})

test('runtime repair reaches real passing Node execution through the V2 dispatcher', async () => {
  const workspace = await setup()
  await workspace.writeFile('w', 'test/service.test.js', "const test = require('node:test'); const assert = require('node:assert/strict'); const { create } = require('../src/service'); test('total', () => assert.equal(create().totals.total, 1250));")
  const actualRunner: BuilderRunnerPort = { async run({ command, files }) {
    const directory = mkdtempSync(join(tmpdir(), 'builder-runtime-repair-'))
    try {
      for (const file of files) {
        mkdirSync(dirname(join(directory, file.path)), { recursive: true })
        writeFileSync(join(directory, file.path), file.content)
      }
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))
      const result = spawnSync('sh', ['-c', command], { cwd: directory, encoding: 'utf8', timeout: 15_000, env })
      return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', timedOut: Boolean(result.error) }
    } finally { rmSync(directory, { recursive: true, force: true }) }
  } }
  const result = await new BuilderV2Agent({ async generate({ prompt }) {
    const context = JSON.parse(prompt)
    assert.equal(context.openFiles['cli.js'], cli)
    assert.equal(context.openFiles['src/service.js'], service)
    return JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'cli.js', search: 'create().total.', replace: 'create().totals.total.' } })
  } }, new BuilderV2Dispatcher(workspace, actualRunner), workspace)
    .run({ workspaceId: 'w', objective, modelCallBudget: 1 })
  assert.equal(result.ok, true, result.summary)
  const runtimeRuns = result.steps.filter(receipt => receipt.tool === 'run_tests'
    && (receipt.output as { requestedCommand?: string })?.requestedCommand === 'node cli.js')
  assert.deepEqual(runtimeRuns.map(receipt => receipt.ok), [false, true])
  assert.match((runtimeRuns[1].output as { stdout: string }).stdout, /1250\.00/)
})
