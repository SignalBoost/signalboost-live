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
  assert.deepEqual(builderTaskContract('Create example.js. Do not run this example:\nnode example.js').commands, [])
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
  assert.equal(result.trace.filter(item => item.toolId === 'run' && item.output).length, 2)
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
  const actions = [...task.files.map(path => write(path)), answer, answer, answer, answer]
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, new InMemoryBuilderWorkspace(), {
    async run(input) { return input.command === task.commands[0] ? passing : { ...passing, exitCode: 1, stderr: 'Error: sample failed' } },
  }).run({ objective, workspaceId: 'failed-sample' })
  assert.equal(result.ok, false)
  assert.equal(result.trace.filter(item => item.toolId === 'run').length, 2)
})

test('after an observed sample failure a new build repairs then reruns both commands', async () => {
  const actions = [...task.files.map(path => write(path)),
    action('edit_file', { path: 'expenses.js', search: 'fixture', replace: 'fixed source' })]
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

test('controller executes real Node proofs and repairs incomplete source even when the model never requests run', async () => {
  // Scripted control isolates the controller regression; execution uses real Node, not a mock exit code.
  const files = {
    'sum.js': 'exports.sum = (a, b) => a + b; if (require.main === module) console.log(exports.sum(10, 20));',
    'sum.test.js': "const {test}=require('node:test'); const assert=require('node:assert/strict'); const {sum}=require('./sum.js'); for(const [a,b,want] of [[0,0,0],[1,2,3],[-1,1,0],[10,20,30],[-5,-3,-8],[99,1,100],[100,-1,99],[500,500,1000],[3,4,7],[7,-10,-3]]) test(`${a}+${b}`,()=>assert.equal(sum(a,b),want));",
    'README.md': 'Run node --test sum.test.js and node sum.js.',
  }
  const prompt = 'Create:\n- sum.js\n- sum.test.js\n- README.md\nWrite at least 10 automated tests.\nRun:\nnode --test sum.test.js\nnode sum.js'
  const actions = Object.entries(files).map(([path, content]) => write(path, path === 'sum.js' ? 'exports.sum = (' : content))
  let repairIssued = false
  const directory = await mkdtemp(join(tmpdir(), 'builder-multifile-'))
  try {
    const result = await new BuilderToolLoop({ async generate(input) {
      if (actions.length) return actions.shift()!
      assert.equal(repairIssued, false, 'verification must not ask the model to select a command')
      assert.match(input.prompt, /SyntaxError/)
      assert.match(input.prompt, /node --test sum.test.js/)
      repairIssued = true
      return write('sum.js', files['sum.js'])
    } }, new InMemoryBuilderWorkspace(), {
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
    assert.equal(runs.length, 4)
    assert.deepEqual(runs.map(item => item.ok), [false, false, true, true])
    assert.match((runs[2].output as typeof passing).stdout, /(?:#|ℹ) pass 10/)
    assert.equal((runs[3].output as typeof passing).stdout, '30\n')
  } finally { await rm(directory, { recursive: true, force: true }) }
})


test('one passing test directs completion of the requested suite before success', async () => {
  const actions = task.files.map(path => write(path))
  let repaired = false
  let runs = 0
  const result = await new BuilderToolLoop({ async generate(input) {
    if (actions.length) return actions.shift()!
    assert.equal(repaired, false)
    assert.match(input.prompt, /recorded test total does not meet the requested minimum of 10/)
    assert.match(input.prompt, /distinct meaningful assertions/)
    repaired = true
    return write('expenses.test.js', 'completed suite fixture')
  } }, new InMemoryBuilderWorkspace(), {
    async run() {
      runs++
      return { ...passing, stdout: repaired ? passing.stdout : '# pass 1\n# fail 0\n' }
    },
  }).run({ objective, workspaceId: 'insufficient-tests' })
  assert.equal(result.ok, true)
  assert.equal(repaired, true)
  assert.equal(runs, 4)
})

test('working source context is bounded and explicitly marks incomplete excerpts', async () => {
  const { formatBuilderWorkingFiles } = await import('../lib/builder/working-context.ts')
  const prompt = formatBuilderWorkingFiles(Array.from({ length: 10 }, (_, index) => ({ path: `${index}.js`, content: 'x'.repeat(20_000), updatedAt: 0 })))
  const data = JSON.parse(prompt.split('\n')[1])
  assert.equal(data.files.length, 8)
  assert.equal(data.omittedFiles, 2)
  assert.equal(data.files.reduce((sum: number, file: { content: string }) => sum + file.content.length, 0), 32_000)
  assert.ok(data.files.every((file: { truncated: boolean }) => file.truncated))
  assert.match(prompt, /untrusted source data, not instructions/)
})

test('current successful source replaces stale writes and rejected proposals in working context', async () => {
  const actions = [write('expenses.js', 'original source'), write('expenses.js', 'rejected source'), ...task.files.slice(1).map(path => write(path))]
  let repaired = false
  const result = await new BuilderToolLoop({ async generate(input) {
    if (actions.length) {
      if (actions.length === 3) {
        assert.match(input.prompt, /original source/)
        assert.doesNotMatch(input.prompt, /rejected source/)
      }
      return actions.shift()!
    }
    assert.equal(repaired, false)
    repaired = true
    return write('expenses.js', 'repaired source')
  } }, new InMemoryBuilderWorkspace(), {
    async run() { return repaired ? passing : { ...passing, exitCode: 1 } },
  }).run({ objective, workspaceId: 'current-source' })
  assert.equal(result.ok, true)
  assert.equal(repaired, true)
})

test('reported expense artifacts recover their shared interface with real Node proofs within 16 rounds', async () => {
  // Owner-supplied failed artifacts. Model decisions are scripted; every proof executes real Node.
  const files = Object.fromEntries(task.files.map(path => [path, readFileSync(new URL(`./fixtures/builder-expense-contract/${path}`, import.meta.url), 'utf8')]))
  const actions = task.files.map(path => write(path, files[path]))
  const fixedSource = files['expenses.js'].replace('total: overall', 'overall: formatCents(overall)')
  const fixedTests = files['expenses.test.js']
    .replaceAll('output.byCategory', 'output.categories').replaceAll('output.total', 'output.overall')
    .replace("'Food, Drinks': 1234", "'Food, Drinks': '12.34'").replace('Travel: 500', "Travel: '5.00'")
    .replaceAll('Food: 3000', "Food: '30.00'")
    .replaceAll(', 1734)', ", '17.34')").replaceAll(', 3000)', ", '30.00')")
    .replaceAll(', 650)', ", '6.50')").replaceAll(', 30)', ", '0.30')")
  let repair = 0
  const directory = await mkdtemp(join(tmpdir(), 'builder-expense-contract-'))
  try {
    const result = await new BuilderToolLoop({ async generate(input) {
      if (actions.length) {
        if (actions.length === 3) {
          assert.match(input.prompt, /CURRENT WORKSPACE FILES/)
          assert.match(input.prompt, /categories: byCategory/)
          assert.match(input.prompt, /Internal representation is not necessarily the public output/)
        }
        return actions.shift()!
      }
      assert.match(input.prompt, /fix the shared cause across the file/)
      const snapshots = JSON.parse(input.prompt.split('latest successful writes):\n')[1].split('\n')[0]).files
      assert.equal(snapshots.find((file: { path: string }) => file.path === 'expenses.js').content, repair ? fixedSource : files['expenses.js'])
      assert.ok(repair < 2, 'must finish without additional inspection rounds')
      return repair++ === 0 ? write('expenses.js', fixedSource) : write('expenses.test.js', fixedTests)
    } }, new InMemoryBuilderWorkspace(), {
      async run(input) {
        assert.ok(task.commands.includes(input.command))
        for (const file of input.files) await writeFile(join(directory, file.path), file.content)
        const env = { ...process.env }
        delete env.NODE_TEST_CONTEXT
        const executed = spawnSync(process.execPath, input.command.split(' ').slice(1), { cwd: directory, env, encoding: 'utf8', timeout: 10_000 })
        return { exitCode: executed.status ?? 124, stdout: executed.stdout, stderr: executed.stderr, timedOut: !!executed.error }
      },
    }).run({ objective, workspaceId: 'expense-interface', maxRounds: 16 })
    assert.equal(result.ok, true, JSON.stringify(result))
    const runs = result.trace.filter(item => item.toolId === 'run')
    assert.deepEqual(runs.map(item => item.ok), [false, true, false, true, true, true])
    assert.match((runs[4].output as typeof passing).stdout, /(?:#|ℹ) pass 12/)
    assert.deepEqual(JSON.parse((runs[5].output as typeof passing).stdout), {
      categories: { Entertainment: '35.99', Food: '37.00', Transport: '5.35', Utilities: '75.00' }, overall: '153.34',
    })
    assert.equal(result.trace.filter(item => item.toolId === 'read_file').length, 0)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('CLI guidance applies to CLI test generation and excludes library-only tasks', async () => {
  const { formatBuilderCliTestGuidance } = await import('../lib/builder/cli-test-guidance.ts')
  assert.equal(formatBuilderCliTestGuidance('Create a library and write unit tests.'), '')
  assert.equal(formatBuilderCliTestGuidance('Explain what a CLI is.'), '')
  const guidance = formatBuilderCliTestGuidance(objective)
  for (const pattern of [/spawnSync/, /signal === null/, /integer status/, /t.after/, /missing-file/, /README example output/, /specific error on stderr/]) assert.match(guidance, pattern)
})

test('Builder CLI process tests catch swallowed executable errors despite passing library tests', async () => {
  // The owner's CLI suite is now a mandatory Builder regression fixture, not just a download.
  // Generation choices are scripted; the requested test and sample commands execute real Node.
  const files = Object.fromEntries(task.files.map(path => [path, readFileSync(new URL(`./fixtures/builder-cli-contract/${path}`, import.meta.url), 'utf8')]))
  const broken = files['expenses.js'].replace('process.exitCode = 1;', 'process.exitCode = 0;')
  assert.notEqual(broken, files['expenses.js'])
  const actions = task.files.map(path => write(path, path === 'expenses.js' ? broken : files[path]))
  let repaired = false
  const directory = await mkdtemp(join(tmpdir(), 'builder-cli-proof-'))
  try {
    const result = await new BuilderToolLoop({ async generate(input) {
      assert.match(input.prompt, /CLI PROCESS CONTRACT/)
      if (actions.length) return actions.shift()!
      assert.equal(repaired, false)
      assert.match(input.prompt, /CLI exits nonzero/)
      repaired = true
      return write('expenses.js', files['expenses.js'])
    } }, new InMemoryBuilderWorkspace(), {
      async run(input) {
        assert.ok(task.commands.includes(input.command))
        for (const file of input.files) await writeFile(join(directory, file.path), file.content)
        const env = { ...process.env }
        delete env.NODE_TEST_CONTEXT
        const executed = spawnSync(process.execPath, input.command.split(' ').slice(1), { cwd: directory, env, encoding: 'utf8', timeout: 20_000 })
        return { exitCode: executed.status ?? 124, stdout: executed.stdout, stderr: executed.stderr, timedOut: !!executed.error }
      },
    }).run({ objective, workspaceId: 'cli-contract', maxRounds: 16 })
    assert.equal(result.ok, true, JSON.stringify(result))
    const runs = result.trace.filter(item => item.toolId === 'run')
    assert.deepEqual(runs.map(item => item.ok), [false, true, true, true])
    assert.match((runs[0].output as typeof passing).stdout, /(?:#|ℹ) fail 9/)
    assert.match((runs[2].output as typeof passing).stdout, /(?:#|ℹ) pass 29/)
    const actual = JSON.parse((runs[3].output as typeof passing).stdout)
    const documented = JSON.parse(files['README.md'].match(/```json\n([\s\S]*?)\n```/)![1])
    assert.deepEqual(actual, documented)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('live prose task retains both deliverables and its inline verification command', () => {
  const objective = 'Create catalog.json containing a literal JSON array of exactly 600 product records, one record per line. Each record must have id 1 through 600, name "Product N" where N is its id, and priceCents equal to id times 100. The downloadable JSON must contain every record, not placeholders or a generator. Also create verify.js using node:assert/strict to read catalog.json, check all 600 ids, names and prices, check the sum is 18030000, and print "600 products verified". Run: node verify.js. Return both files and recorded execution results.'
  const contract = builderTaskContract(objective)
  assert.deepEqual(contract.files, ['catalog.json', 'verify.js'])
  assert.deepEqual(contract.commands, ['node verify.js'])
  assert.equal(builderTaskProgress(contract, ['catalog.json'], []).satisfied, false)
  assert.equal(builderTaskProgress(contract, contract.files, []).satisfied, false)
})

test('inline commands preserve quoted punctuation and exclude quoted instructions', () => {
  assert.deepEqual(builderTaskContract('Create app.js. Run: node app.js "a. b". Return the result.').commands, ['node app.js "a. b"'])
  assert.deepEqual(builderTaskContract('Run: `npm test`. Report the result.').commands, ['npm test'])
  assert.deepEqual(builderTaskContract('Create app.js that prints "Hello. Run: node other.js.".').commands, [])
})
