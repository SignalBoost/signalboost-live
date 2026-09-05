import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { builderTaskContract, builderTaskProgress } from '../lib/builder/task-contract.ts'
import { isRepairObjective } from '../lib/builder/regression-gate.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const objective = `Build a Node.js expense-report CLI using only built-in modules.
Create:
- expenses.js
- expenses.test.js
- sample.csv
- README.md
Reject invalid dates, missing columns, and malformed amounts with a clear error and nonzero exit code.
Write at least 10 meaningful automated tests covering normal input, edge cases, and failures.
Run:
node --test expenses.test.js
node expenses.js sample.csv
If any test fails, fix the implementation and rerun it.
Claim success only after all tests and the sample command pass.`
const action = (toolId: string, input: Record<string, unknown>) => JSON.stringify({ type: 'tool', toolId, input })
const write = (path: string, content = 'fixture') => action('write_file', { path, content })
const run = (command: string) => action('run', { command })
const answer = JSON.stringify({ type: 'answer', answer: 'Complete.' })
const passing = { exitCode: 0, stdout: '# tests 10\n# pass 10\n# fail 0\n', stderr: '', timedOut: false }
const entry = (command: string, output = passing): BuilderToolTrace => ({ round: 1, toolId: 'run', input: { command }, ok: output.exitCode === 0, output })
const task = builderTaskContract(objective)

test('the reported new build is not an existing repair despite error requirements and conditional recovery', () => {
  assert.equal(isRepairObjective(objective), false)
  for (const request of ['Fix expenses.js.', 'Repair the broken CLI.', 'Create a regression test and fix the bug.', 'Fixed expenses.js.', 'The program crashes.']) assert.equal(isRepairObjective(request), true, request)
  assert.deepEqual(task.files, ['expenses.js', 'expenses.test.js', 'sample.csv', 'README.md'])
  assert.deepEqual(task.commands, ['node --test expenses.test.js', 'node expenses.js sample.csv'])
  assert.equal(task.minimumTests, 10)
})

test('references are not deliverables and declared traversal is not accepted', () => {
  const contract = builderTaskContract('Create:\n- result.json\n- ../secret.txt\nCompare with old.csv.\nRun:\n`node check.js`')
  assert.deepEqual(contract.files, ['result.json'])
  assert.deepEqual(contract.commands, ['node check.js'])
  assert.equal(builderTaskContract('Write at least 10 tests.\npython3 -m unittest').minimumTests, 0)
})

test('completion requires all files, all commands, and the requested number of passing tests', () => {
  const proof = [entry(task.commands[0]), entry(task.commands[1])]
  assert.equal(builderTaskProgress(task, task.files, proof).satisfied, true)
  assert.equal(builderTaskProgress(task, ['expenses.js'], proof).satisfied, false)
  assert.equal(builderTaskProgress(task, task.files, proof.slice(0, 1)).satisfied, false)
  assert.equal(builderTaskProgress(task, task.files, [entry(task.commands[0], { ...passing, stdout: '# pass 1\n# fail 0\n' }), proof[1]]).satisfied, false)
})

test('stale, failed, missing-exit and timed-out proof cannot complete the task', () => {
  const proof = [entry(task.commands[0]), entry(task.commands[1])]
  const change: BuilderToolTrace = { round: 2, toolId: 'edit_file', input: { path: 'expenses.js' }, ok: true }
  assert.equal(builderTaskProgress(task, task.files, [...proof, change]).satisfied, false)
  assert.equal(builderTaskProgress(task, task.files, [...proof, entry(task.commands[1], { ...passing, exitCode: 1 })]).satisfied, false)
  assert.equal(builderTaskProgress(task, task.files, [proof[0], { ...proof[1], output: {} }]).satisfied, false)
  assert.equal(builderTaskProgress(task, task.files, [proof[0], entry(task.commands[1], { ...passing, timedOut: true })]).satisfied, false)
})

test('new-file polishing is redirected to missing deliverables without consuming the write budget', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const actions = [write('expenses.js'), action('edit_file', { path: 'expenses.js', search: 'fixture', replace: 'polished' }),
    ...task.files.slice(1).map(path => write(path)), ...task.commands.map(run)]
  let calls = 0
  const result = await new BuilderToolLoop({ async generate(input) {
    assert.doesNotMatch(input.prompt, /REPAIR PHASE/)
    if (calls++ === 2) assert.match(input.prompt, /builder_missing_deliverables/)
    return actions.shift() || null
  } }, workspace, { async run() { return passing } }).run({ objective, workspaceId: 'new-project' })
  assert.equal(result.ok, true)
  assert.equal(result.trace.filter(item => item.toolId === 'run').length, 2)
  assert.equal(result.trace.some(item => item.error === 'builder_missing_deliverables'), true)
  assert.equal((await workspace.readFile('new-project', 'expenses.js'))?.content, 'fixture')
})

test('a premature answer cannot complete a new build without running code', async () => {
  const actions = [write('expenses.js'), answer, answer, answer, answer]
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, new InMemoryBuilderWorkspace(), {
    async run() { assert.fail('no command requested') },
  }).run({ objective, workspaceId: 'early-answer' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'builder_task_incomplete')
})

test('a successful test command cannot hide a failed sample command', async () => {
  const actions = [...task.files.map(path => write(path)), ...task.commands.map(run), answer, answer, answer, answer]
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, new InMemoryBuilderWorkspace(), {
    async run(input) { return input.command === task.commands[0] ? passing : { ...passing, exitCode: 1, stderr: 'Error: sample failed' } },
  }).run({ objective, workspaceId: 'failed-sample' })
  assert.equal(result.ok, false)
  assert.equal(result.trace.filter(item => item.toolId === 'run').length, 2)
})

test('after an observed sample failure a new build repairs then reruns both commands', async () => {
  const actions = [...task.files.map(path => write(path)), ...task.commands.map(run),
    action('edit_file', { path: 'expenses.js', search: 'fixture', replace: 'fixed source' }), ...task.commands.map(run)]
  let runs = 0
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, new InMemoryBuilderWorkspace(), {
    async run() { return ++runs === 2 ? { ...passing, exitCode: 1, stderr: 'Error: sample failed' } : passing },
  }).run({ objective, workspaceId: 'recovered-sample' })
  assert.equal(result.ok, true)
  assert.equal(runs, 4)
})

test('budget exhaustion is never described as a runtime failure without a run', () => {
  const reply = formatBuilderOperatorRepairReply({ ok: false, error: 'builder_write_budget_exhausted', trace: [
    { toolId: 'write_file', ok: true, path: 'expenses.js' }, { toolId: 'read_file', ok: false, error: 'builder_repeated_tool_call:read_file' },
  ] })
  assert.match(reply, /work limit/)
  assert.doesNotMatch(reply, /runtime failure/)
})

test('changed production modules parse before deployment', () => {
  for (const path of ['task-contract', 'regression-gate', 'tool-loop', 'job-runner', 'operator-narration']) {
    assert.doesNotThrow(() => stripTypeScriptTypes(readFileSync(new URL(`../lib/builder/${path}.ts`, import.meta.url), 'utf8')))
  }
})

test('multi-file Builder executes real Node tests and a separate sample command', async () => {
  // Scripted control isolates the controller regression; execution uses real Node, not a mock exit code.
  const files = {
    'sum.js': 'exports.sum = (a, b) => a + b; if (require.main === module) console.log(exports.sum(10, 20));',
    'sum.test.js': "const {test}=require('node:test'); const assert=require('node:assert/strict'); const {sum}=require('./sum.js'); for(const [a,b,want] of [[0,0,0],[1,2,3],[-1,1,0],[10,20,30],[-5,-3,-8],[99,1,100],[100,-1,99],[500,500,1000],[3,4,7],[7,-10,-3]]) test(`${a}+${b}`,()=>assert.equal(sum(a,b),want));",
    'README.md': 'Run node --test sum.test.js and node sum.js.',
  }
  const prompt = 'Create:\n- sum.js\n- sum.test.js\n- README.md\nWrite at least 10 automated tests.\nRun:\nnode --test sum.test.js\nnode sum.js'
  const actions = [...Object.entries(files).map(([path, content]) => write(path, content)), run('node --test sum.test.js'), run('node sum.js')]
  const directory = await mkdtemp(join(tmpdir(), 'builder-multifile-'))
  try {
    const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, new InMemoryBuilderWorkspace(), {
      async run(input) {
        assert.ok(['node --test sum.test.js', 'node sum.js'].includes(input.command))
        for (const file of input.files) await writeFile(join(directory, file.path), file.content)
        const env = { ...process.env }
        delete env.NODE_TEST_CONTEXT
        const executed = spawnSync(process.execPath, input.command.split(' ').slice(1), { cwd: directory, env, encoding: 'utf8', timeout: 10_000 })
        return { exitCode: executed.status ?? 124, stdout: executed.stdout, stderr: executed.stderr, timedOut: !!executed.error }
      },
    }).run({ objective: prompt, workspaceId: 'real-node-multifile' })
    assert.equal(result.ok, true, JSON.stringify(result))
    const runs = result.trace.filter(item => item.toolId === 'run')
    assert.equal(runs.length, 2)
    assert.match((runs[0].output as typeof passing).stdout, /(?:#|ℹ) pass 10/)
    assert.equal((runs[1].output as typeof passing).stdout, '30\n')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
