import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'
import { verifiedRepairLesson } from '../lib/builder/verified-lessons.ts'
import { evaluateBuilderCertification } from '../lib/builder/certification.ts'

class ScriptedBuilderAi implements BuilderAiPort {
  private cursor = 0
  private readonly actions: readonly string[]
  constructor(actions: readonly string[]) { this.actions = actions }
  async generate() { return this.actions[this.cursor++] ?? null }
}

test('Builder writes a user file, runs it, and returns only after tool evidence', async () => {
  const workspace = new InMemoryBuilderWorkspace(() => 1)
  const runner: BuilderRunnerPort = { async run(input) { assert.equal(input.workspaceId, 'user:1'); assert.equal(input.files[0]?.path, 'hello.js'); return { exitCode: 0, stdout: 'hello\n', stderr: '', timedOut: false } } }
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"write_file","input":{"path":"hello.js","content":"console.log(\\"hello\\")"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node hello.js"}}',
    '{"type":"answer","answer":"Created hello.js and ran node hello.js successfully."}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'create hello', workspaceId: 'user:1' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.trace.map(item => item.toolId), ['write_file', 'run'])
  assert.equal((await workspace.readFile('user:1', 'hello.js'))?.content, 'console.log("hello")')
  assert.equal(evaluateBuilderCertification('create_and_run_javascript_v1', result).passed, true)
})

test('Builder recovers when the model replays a completed tool call', async () => {
  const workspace = new InMemoryBuilderWorkspace(() => 3)
  const runner: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: 'hello\n', stderr: '', timedOut: false } } }
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"write_file","input":{"path":"hello.js","content":"console.log(\\"hello\\")"}}',
    '{"type":"tool","toolId":"write_file","input":{"path":"hello.js","content":"console.log(\\"hello\\")"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node hello.js"}}',
    '{"type":"answer","answer":"Created and ran hello.js."}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'Create hello.js and run it.', workspaceId: 'user:replay' })
  assert.equal(result.ok, true)
  assert.equal(result.trace.some(item => String(item.error || '').startsWith('builder_repeated_tool_call:write_file')), true)
  assert.equal(result.trace.some(item => item.toolId === 'run' && item.ok), true)
})

test('Builder observes a failed command, classifies it, and retries without consuming the run budget', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const runner: BuilderRunnerPort = { async run() { calls += 1; return calls === 1 ? { exitCode: 1, stdout: '', stderr: 'Error: Cannot find module hello.js', timedOut: false } : { exitCode: 0, stdout: 'hello\n', stderr: '', timedOut: false } } }
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"run","input":{"command":"node hello.js"}}',
    '{"type":"tool","toolId":"list_files","input":{}}',
    '{"type":"tool","toolId":"run","input":{"command":"node ./hello.js"}}',
    '{"type":"answer","answer":"Verified the repaired command."}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'recover node command', workspaceId: 'user:retry' })
  assert.equal(result.ok, true)
  assert.equal(calls, 2)
  assert.equal(result.trace[0]?.ok, false)
  assert.equal(result.trace[0]?.failureClass, 'path')
  assert.equal(result.trace.some(item => item.toolId === 'run' && item.ok), true)
  const lesson = verifiedRepairLesson(result)
  assert.equal(lesson?.failureClass, 'path')
  assert.equal(lesson?.regressionCommand, 'node ./hello.js')
  assert.equal(lesson?.runtime, 'node24-network-denied-ephemeral')
  assert.equal(evaluateBuilderCertification('observe_failure_and_recover_v1', result).passed, true)
})

test('Builder does not declare a repair complete without successful runtime evidence', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const runner: BuilderRunnerPort = { async run() { return { exitCode: 1, stdout: '', stderr: 'AssertionError: broken', timedOut: false } } }
  const ai = new ScriptedBuilderAi(Array(4).fill('{"type":"answer","answer":"Fixed."}'))
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'fix broken test', workspaceId: 'user:verify' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'builder_regression_evidence_required')
  assert.equal(verifiedRepairLesson(result), null)
})

test('Builder requires fail then repair then pass evidence only for repair objectives', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('user:regression', 'app.js', 'throw new Error("broken")')
  let runs = 0
  const runner: BuilderRunnerPort = { async run() { runs += 1; return runs === 1 ? { exitCode: 1, stdout: '', stderr: 'AssertionError: broken', timedOut: false } : { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false } } }
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"run","input":{"command":"node --test app.test.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"throw new Error(\\"broken\\")","replace":"console.log(\\"fixed\\")"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node --test app.test.js"}}',
    '{"type":"answer","answer":"Fixed and proved by regression test."}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'fix broken app', workspaceId: 'user:regression' })
  assert.equal(result.ok, true)
  assert.equal(runs, 2)
})

test('Builder fixes a supplied file after inspecting it and runs the corrected workspace', async () => {
  const workspace = new InMemoryBuilderWorkspace(() => 2)
  await workspace.writeFile('user:2', 'app.js', 'throw new Error("broken")')
  const runner: BuilderRunnerPort = { async run(input) { assert.equal(input.files[0]?.content, 'console.log("fixed")'); return { exitCode: 0, stdout: 'fixed\n', stderr: '', timedOut: false } } }
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"read_file","input":{"path":"app.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"throw new Error(\\"broken\\")","replace":"console.log(\\"fixed\\")"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node app.js"}}',
    '{"type":"answer","answer":"Fixed app.js and verified it runs."}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'update supplied file', workspaceId: 'user:2' })
  assert.equal(result.ok, true)
  assert.equal((await workspace.readFile('user:2', 'app.js'))?.content, 'console.log("fixed")')
  assert.equal(evaluateBuilderCertification('inspect_repair_and_run_v1', result).passed, true)
})

test('Builder rejects traversal and never permits host files', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await assert.rejects(() => workspace.writeFile('user:3', '../.env', 'no'), /builder_invalid_path/)
})

test('Builder stops after the bounded command-run budget', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const runner: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }
  const ai = new ScriptedBuilderAi([
    '{"type":"tool","toolId":"run","input":{"command":"echo 1"}}',
    '{"type":"tool","toolId":"run","input":{"command":"echo 2"}}',
    '{"type":"tool","toolId":"run","input":{"command":"echo 3"}}',
    '{"type":"tool","toolId":"run","input":{"command":"echo 4"}}',
  ])
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'run repeatedly', workspaceId: 'user:4', maxRounds: 8 })
  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'builder_run_budget_exhausted')
  assert.equal(result.trace.length, 3)
})
