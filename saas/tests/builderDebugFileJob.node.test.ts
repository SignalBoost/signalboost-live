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
  assert.deepEqual(plan.paths, ['broken.js'])

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

test('debug planning admits one to four small source files and prefers a supplied JS/TS test as proof entrypoint', () => {
  assert.equal(planDebugFileJob('Debug this.', []), null)
  const plan = planDebugFileJob('Debug this.', [
    { path: 'src/math.ts', content: 'export const value = 1' },
    { path: 'src/math.test.ts', content: 'console.log(value)' },
  ])
  assert.ok(plan)
  assert.deepEqual(plan.paths, ['src/math.ts', 'src/math.test.ts'])
  assert.equal(plan.path, 'src/math.test.ts')
  assert.equal(plan.command, "node --experimental-strip-types 'src/math.test.ts'")

  assert.equal(planDebugFileJob('Debug this.', [
    { path: 'app.py', content: 'def add(a, b): return a - b' },
    { path: 'test_app.py', content: 'def test_add(): assert add(2, 3) == 5' },
  ]), null, 'pytest-style bundles must be rejected when no real test-discovery proof command is available')

  assert.equal(planDebugFileJob('Debug this.', Array.from({ length: 5 }, (_, index) => ({
    path: `file-${index}.js`, content: `console.log(${index})`,
  }))), null)
  assert.equal(planDebugFileJob('Debug this.', [
    { path: 'one.js', content: 'x' },
    { path: 'notes.txt', content: 'y' },
  ]), null)
  assert.equal(planDebugFileJob('Debug this.', [
    { path: 'same.js', content: 'x' },
    { path: 'same.js', content: 'y' },
  ]), null)
  assert.equal(planDebugFileJob(
    '16:19:34 Vercel CLI 59.3.0\n16:20:11 Error: Command "npm test" exited with 1',
    [{ path: 'broken.js', content: 'x' }],
  ), null)
})

test('multi-file debug reads source and test together, edits the faulty source, and proves the test passes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:debug-multi-file'
  const sourcePath = 'src/math.ts'
  const testPath = 'src/math.test.ts'
  await workspace.writeFile(workspaceId, sourcePath, 'export function add(a: number, b: number) { return a - b }\n')
  await workspace.writeFile(workspaceId, testPath, "import { add } from './math.ts'\nif (add(2, 3) !== 5) throw new Error('wrong sum')\n")

  const plan = planDebugFileJob('Fix the attached source and test.', [
    { path: sourcePath, content: 'export function add(a: number, b: number) { return a - b }\n' },
    { path: testPath, content: "import { add } from './math.ts'\nif (add(2, 3) !== 5) throw new Error('wrong sum')\n" },
  ])
  assert.ok(plan)
  assert.equal(plan.path, testPath)

  const runner: BuilderRunnerPort = {
    async run(input) {
      assert.equal(input.command, "node --experimental-strip-types 'src/math.test.ts'")
      assert.deepEqual(input.files.map(file => file.path), [sourcePath, testPath])
      const source = input.files.find(file => file.path === sourcePath)?.content || ''
      return source.includes('return a - b')
        ? { exitCode: 1, stdout: '', stderr: 'Error: wrong sum', timedOut: false }
        : { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
    },
  }

  let modelPrompt = ''
  const ai: BuilderAiPort = {
    async generate(input) {
      modelPrompt = input.prompt
      return JSON.stringify({
        type: 'tool',
        toolId: 'edit_file',
        input: {
          path: sourcePath,
          search: 'return a - b',
          replace: 'return a + b',
        },
      })
    },
  }

  const result = await runDebugFileJob({
    objective: 'Fix the attached source and test.',
    workspaceId,
    plan,
    workspace,
    runner,
    ai,
  })
  if (!result.ok) assert.fail(result.error)

  assert.match(modelPrompt, /FILE: src\/math\.ts/)
  assert.match(modelPrompt, /FILE: src\/math\.test\.ts/)
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['list_files', true],
    ['read_file', true],
    ['read_file', true],
    ['run', false],
    ['edit_file', true],
    ['run', true],
  ])
  assert.match(result.answer, /using 2 supplied files/)
  assert.match(result.answer, /Verification exit code: 0/)
  assert.equal((await workspace.readFile(workspaceId, sourcePath))?.content, 'export function add(a: number, b: number) { return a + b }\n')
})

test('a passing directly executable Python file stops after the first run with no model call', async () => {
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
