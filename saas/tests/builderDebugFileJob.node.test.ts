import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import {
  planDebugFileJob,
  runDebugFileJob,
} from '../lib/builder/debug-file-job.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

test('debug job runs one file, applies one edit, reruns the same command, and stops', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:debug-one-file'
  await workspace.writeFile(workspaceId, 'broken.js', "throw new Error('boom')\n")

  const plan = planDebugFileJob('Debug the attached file in Builder.', [
    { path: 'broken.js', content: "throw new Error('boom')\n" },
  ])
  assert.ok(plan)
  assert.equal(plan.command, "node 'broken.js'")

  const commands: string[] = []
  const runner: BuilderRunnerPort = {
    async run(input) {
      commands.push(input.command)
      const source = input.files.find(file => file.path === 'broken.js')?.content || ''
      if (source.includes("throw new Error('boom')")) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'Error: boom\n    at Object.<anonymous> (/tmp/cos-builder/broken.js:1:7)',
          timedOut: false,
        }
      }
      assert.equal(source, "console.log('fixed')\n")
      return { exitCode: 0, stdout: 'fixed\n', stderr: '', timedOut: false }
    },
  }

  let calls = 0
  const ai: BuilderAiPort = {
    async generate() {
      calls += 1
      if (calls === 1) return 'I will make a small edit.'
      return JSON.stringify({
        type: 'tool',
        toolId: 'edit_file',
        input: {
          path: 'broken.js',
          search: "throw new Error('boom')",
          replace: "console.log('fixed')",
        },
      })
    },
  }

  const result = await runDebugFileJob({
    objective: 'Debug the attached file in Builder.',
    workspaceId,
    plan,
    workspace,
    runner,
    ai,
  })

  if (!result.ok) assert.fail(result.error)
  assert.equal(calls, 2, 'one malformed-control recovery is allowed')
  assert.deepEqual(commands, ["node 'broken.js'", "node 'broken.js'"])
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['list_files', true],
    ['read_file', true],
    ['run', false],
    ['edit_file', true],
    ['run', true],
  ])
  assert.match(result.answer, /First exit code: 1/)
  assert.match(result.answer, /Error: boom/)
  assert.match(result.answer, /Verification exit code: 0/)
  assert.equal((await workspace.readFile(workspaceId, 'broken.js'))?.content, "console.log('fixed')\n")
})

test('debug planning requires exactly one small supported source file and rejects logs', () => {
  assert.equal(planDebugFileJob('Debug this.', []), null)
  assert.equal(planDebugFileJob('Debug this.', [
    { path: 'one.js', content: 'x' },
    { path: 'two.js', content: 'y' },
  ]), null)
  assert.equal(planDebugFileJob('Debug this.', [{ path: 'notes.txt', content: 'x' }]), null)
  assert.equal(planDebugFileJob(
    '16:19:34 Vercel CLI 59.3.0\n16:20:11 Error: Command "npm test" exited with 1',
    [{ path: 'broken.js', content: 'x' }],
  ), null)
})

test('a passing attached file stops after the first run with no model call', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:debug-passing-file'
  await workspace.writeFile(workspaceId, 'healthy.py', "print('ok')\n")
  const plan = planDebugFileJob('Debug the attached Python file.', [{ path: 'healthy.py', content: "print('ok')\n" }])
  assert.ok(plan)

  let modelCalls = 0
  const result = await runDebugFileJob({
    objective: 'Debug the attached Python file.',
    workspaceId,
    plan,
    workspace,
    runner: {
      async run(input) {
        assert.equal(input.command, "python3 'healthy.py'")
        return { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
      },
    },
    ai: { async generate() { modelCalls += 1; return null } },
  })

  assert.equal(result.ok, true)
  assert.equal(modelCalls, 0)
  assert.deepEqual(result.trace.map(item => item.toolId), ['list_files', 'read_file', 'run'])
})
