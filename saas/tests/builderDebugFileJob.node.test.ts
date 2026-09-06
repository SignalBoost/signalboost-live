import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import {
  extractBuilderSourceFiles,
  planDebugFileJob,
  runDebugFileJob,
} from '../lib/builder/debug-file-job.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

test('debug job runs one file, applies one edit, reruns the same command, and stops after verification passes', async () => {
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

test('debug planning requires an explicit action and one to four small supported source files', () => {
  assert.equal(planDebugFileJob('Debug this.', []), null)
  assert.deepEqual(planDebugFileJob('Debug this.', [
    { path: 'one.js', content: 'x' },
    { path: 'two.js', content: 'y' },
  ]), {
    path: 'one.js',
    command: "node 'one.js'",
    runtime: 'node',
    files: ['one.js', 'two.js'],
  })
  assert.equal(planDebugFileJob('Debug this.', [{ path: 'notes.txt', content: 'x' }]), null)
  assert.equal(planDebugFileJob(
    '16:19:34 Vercel CLI 59.3.0\n16:20:11 Error: Command "npm test" exited with 1',
    [{ path: 'broken.js', content: 'x' }],
  ), null)
  assert.equal(planDebugFileJob('Debug this.', [
    { path: 'a.js', content: '1' },
    { path: 'b.js', content: '2' },
    { path: 'c.js', content: '3' },
    { path: 'd.js', content: '4' },
    { path: 'e.js', content: '5' },
  ]), null)
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

test('debug job can repair source while proving with its attached test', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:debug-source-and-test'
  await workspace.writeFile(workspaceId, 'add.js', 'export function add(a, b) { return a - b }\n')
  await workspace.writeFile(workspaceId, 'add.test.js', "import { add } from './add.js'\nif (add(2, 2) !== 4) throw new Error('expected 4')\n")

  const plan = planDebugFileJob('Fix the attached files. The test is failing.', [
    { path: 'add.js', content: 'export function add(a, b) { return a - b }\n' },
    { path: 'add.test.js', content: "import { add } from './add.js'\nif (add(2, 2) !== 4) throw new Error('expected 4')\n" },
  ])
  assert.ok(plan)
  assert.equal(plan.path, 'add.test.js')
  assert.equal(plan.command, "node 'add.test.js'")
  assert.deepEqual(plan.files, ['add.js', 'add.test.js'])

  const runner: BuilderRunnerPort = {
    async run(input) {
      const source = input.files.find(file => file.path === 'add.js')?.content || ''
      if (source.includes('return a - b')) {
        return { exitCode: 1, stdout: '', stderr: 'Error: expected 4', timedOut: false }
      }
      return { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
    },
  }
  const ai: BuilderAiPort = {
    async generate() {
      return JSON.stringify({
        type: 'tool',
        toolId: 'edit_file',
        input: { path: 'add.js', search: 'return a - b', replace: 'return a + b' },
      })
    },
  }

  const result = await runDebugFileJob({
    objective: 'Fix the attached files. The test is failing.',
    workspaceId,
    plan,
    workspace,
    runner,
    ai,
  })
  if (!result.ok) assert.fail(result.error)
  assert.equal((await workspace.readFile(workspaceId, 'add.js'))?.content, 'export function add(a, b) { return a + b }\n')
  assert.match(result.answer, /Verification exit code: 0/)
})

test('multi-file debug keeps iterating after a failed verification and can repair a second file', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:debug-multi-file-iterate'
  await workspace.writeFile(workspaceId, 'left.js', 'export const left = 1\n')
  await workspace.writeFile(workspaceId, 'right.js', 'export const right = 2\n')
  await workspace.writeFile(workspaceId, 'sum.test.js', "import { left } from './left.js'\nimport { right } from './right.js'\nif (left + right !== 5) throw new Error(`sum=${left + right}`)\n")

  const plan = planDebugFileJob('Fix the attached files until the test passes.', [
    { path: 'left.js', content: 'export const left = 1\n' },
    { path: 'right.js', content: 'export const right = 2\n' },
    { path: 'sum.test.js', content: "import { left } from './left.js'\nimport { right } from './right.js'\nif (left + right !== 5) throw new Error(`sum=${left + right}`)\n" },
  ])
  assert.ok(plan)
  assert.equal(plan.path, 'sum.test.js')

  const commands: string[] = []
  const runner: BuilderRunnerPort = {
    async run(input) {
      commands.push(input.command)
      const left = input.files.find(file => file.path === 'left.js')?.content || ''
      const right = input.files.find(file => file.path === 'right.js')?.content || ''
      if (left.includes('left = 1')) return { exitCode: 1, stdout: '', stderr: 'Error: sum=3', timedOut: false }
      if (right.includes('right = 2')) return { exitCode: 1, stdout: '', stderr: 'Error: sum=4', timedOut: false }
      return { exitCode: 0, stdout: 'sum=5\n', stderr: '', timedOut: false }
    },
  }

  let calls = 0
  const ai: BuilderAiPort = {
    async generate(input) {
      calls += 1
      if (calls === 1) {
        assert.match(input.prompt, /LATEST STDERR:\nError: sum=3/)
        return JSON.stringify({
          type: 'tool', toolId: 'edit_file',
          input: { path: 'left.js', search: 'left = 1', replace: 'left = 2' },
        })
      }
      assert.match(input.prompt, /LATEST STDERR:\nError: sum=4/)
      assert.match(input.prompt, /ALREADY CHANGED FILES: left\.js/)
      return JSON.stringify({
        type: 'tool', toolId: 'edit_file',
        input: { path: 'right.js', search: 'right = 2', replace: 'right = 3' },
      })
    },
  }

  const result = await runDebugFileJob({
    objective: 'Fix the attached files until the test passes.',
    workspaceId,
    plan,
    workspace,
    runner,
    ai,
  })
  if (!result.ok) assert.fail(result.error)

  assert.equal(calls, 2)
  assert.deepEqual(commands, ["node 'sum.test.js'", "node 'sum.test.js'", "node 'sum.test.js'"])
  assert.deepEqual(result.trace.filter(item => item.toolId === 'edit_file').map(item => [item.input.path, item.ok]), [
    ['left.js', true],
    ['right.js', true],
  ])
  assert.match(result.answer, /Repair iterations: 2/)
  assert.match(result.answer, /Changed files: `left\.js`, `right\.js`/)
  assert.match(result.answer, /Verification exit code: 0/)
})

test('Concierge data-URL attachments decode into editable source files', () => {
  const content = 'console.log(1)\n'
  const files = extractBuilderSourceFiles([
    {
      name: 'app.js',
      mimeType: 'text/javascript',
      dataUrl: `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`,
    },
    { name: 'notes.txt', dataUrl: `data:text/plain;base64,${Buffer.from('log only').toString('base64')}` },
  ])
  assert.deepEqual(files, [{ path: 'app.js', content }])
})


test('complete application intake retains JSON and bypasses the single-file shortcut', () => {
  const files = [
    { path: 'package.json', content: '{"dependencies":{"is-number":"7.0.0"}}' },
    { path: 'money.js', content: 'require("is-number")' },
    { path: 'report.js', content: 'require("./money")' },
    { path: 'cli.js', content: 'require("./report")' },
    { path: 'sample.json', content: '[]' },
    { path: 'report.test.js', content: 'require("./sample.json")' },
  ]
  assert.deepEqual(extractBuilderSourceFiles(files), files)
  assert.equal(planDebugFileJob('Repair this application. Run: npm test.', files), null)
  assert.equal(planDebugFileJob('Repair this application.', files), null)
  assert.equal(planDebugFileJob('Repair this file. Run: npm test.', [files[1]]), null)
  assert.equal(planDebugFileJob('Repair this file. Run: node money.js. Run: node cli.js.', [files[1]]), null)
  assert.equal(planDebugFileJob('Repair this file. Run: node money.js.', [files[1]]), null)
  assert.ok(planDebugFileJob('Repair this file.', [files[1]]))
})

test('unparsed execution requests cannot use the inferred single-file proof', () => {
  const files = [{ path: 'app.js', content: 'console.log("ok")' }]
  for (const prompt of [
    'Repair app.js. Run `node verify.js`.',
    'Repair app.js and execute node verify.js.',
    'Repair app.js. Run: node app.js. Also run `node verify.js`.',
    'Repair app.js; verify by running `node verify.js`.',
    'Repair app.js; test with `node verify.js`.',
    'Repair app.js; invoke ./verify.sh.',
    'Repair app.js; verification command: `node verify.js`.',
  ]) assert.equal(planDebugFileJob(prompt, files), null)
})
