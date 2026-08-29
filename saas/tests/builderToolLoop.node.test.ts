import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

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
  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'fix traceback', workspaceId: 'user:2' })
  assert.equal(result.ok, true)
  assert.equal((await workspace.readFile('user:2', 'app.js'))?.content, 'console.log("fixed")')
})

test('Builder rejects traversal and never permits host files', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await assert.rejects(() => workspace.writeFile('user:3', '../.env', 'no'), /builder_invalid_path/)
})
