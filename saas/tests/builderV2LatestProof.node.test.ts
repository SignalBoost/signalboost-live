import test from 'node:test'
import assert from 'node:assert/strict'
import { builderV2Acceptance, BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher, type BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const receipt = (command: string, exitCode: number, passed: number): BuilderV2Receipt => ({
  tool: 'run_tests', ok: exitCode === 0, changed: false,
  output: { requestedCommand: command, executedCommand: command, exitCode,
    stdout: `ℹ pass ${passed}\nℹ fail ${exitCode ? 1 : 0}\n`, timedOut: false },
})
test('an executed failure after a passing test blocks V2 acceptance', () => {
  const objective = 'Run:\nnode --test test/*.test.js'
  const run = 'node --test test/*.test.js'
  const runs = [receipt(run, 0, 30), receipt(run, 1, 29)]
  assert.equal(builderV2Acceptance(objective, [], runs).satisfied, false)
  assert.deepEqual(builderV2Acceptance(objective, [], runs).pendingCommands, [run])
  assert.equal(builderV2Acceptance(objective, [], [...runs, receipt(run, 0, 30)]).satisfied, true)
})
test('later successful smoke test cannot hide the failed full-suite command', () => {
  const suite = 'node --test test/*.test.js'
  const demo = 'node index.js'
  const objective = `Run:\n${suite}\n${demo}`
  const result = builderV2Acceptance(objective, [], [receipt(suite, 0, 30), receipt(suite, 1, 29), receipt(demo, 0, 0)])
  assert.equal(result.satisfied, false)
  assert.deepEqual(result.pendingCommands, [suite])
})
test('a failed V2 test after success invalidates the in-memory verified revision', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const commands = [
    { type: 'tool', action: { tool: 'write_file', path: 'package.json', content: '{"scripts":{"test":"node --test"}}' } },
    { type: 'tool', action: { tool: 'write_file', path: 'index.js', content: 'module.exports=1' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'npm test' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'npm test' } },
    { type: 'finish', summary: 'complete' },
  ]
  let runs = 0
  const ai = { async generate() { return JSON.stringify(commands.shift() ?? { type: 'finish', summary: 'complete' }) } }
  const runner = { async run() {
    runs++
    return { exitCode: runs === 1 ? 0 : 1, stdout: '', stderr: 'failure', timedOut: false }
  } }
  const result = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace)
    .run({ workspaceId: 'v2-last-proof', objective: 'Create index.js and run npm test.', maxSteps: 8 })
  // The first passing host receipt completes this one-command objective.
  // The model cannot trigger another redundant test to revoke finished work.
  assert.equal(result.ok, true)
  assert.equal(runs, 1)
  assert.equal(result.reason, 'verified')
})

test('empty workspace cannot run npm test until a package manifest exists', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let modelCall = 0
  let runnerCalls = 0
  const ai = { async generate() {
    modelCall++
    if (modelCall === 1) return JSON.stringify({ type: 'tool', action: { tool: 'run_tests', command: 'npm test' } })
    if (modelCall === 2) return JSON.stringify({ type: 'tool', action: { tool: 'write_file',
      path: 'package.json', content: '{"scripts":{"test":"node --test"}}' } })
    return JSON.stringify({ type: 'finish', summary: 'done' })
  } }
  const runner = { async run() { runnerCalls++; return { exitCode: 0, stdout: 'ℹ pass 1\\nℹ fail 0\\n', stderr: '', timedOut: false } } }
  const result = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace)
    .run({ workspaceId: 'missing-manifest', objective: 'Create package.json. Run npm test.', maxSteps: 8 })
  assert.equal(result.ok, true)
  assert.equal(runnerCalls, 1, 'only the post-manifest npm command may execute')
  assert.equal(result.reason, 'verified')
})
