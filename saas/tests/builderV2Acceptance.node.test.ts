// saas/tests/builderV2Acceptance.node.test.ts
//
// Builder V2 accepted completion after any passing run_tests following the last change. Production OrderFlow runs
// (2026-10-14) had passing test runs with 8-10 of 15 required files written, so a passing run alone is not completion.
// V2 now reads the objective's checklist (required files, required commands, minimum test count) from the same task
// contract as V1, gives it to the model, and accepts completion only when host receipts satisfy all of it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BuilderV2Agent, builderV2Acceptance } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher, type BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const ORDERFLOW = readFileSync(new URL('./fixtures/builder-orderflow-request.md', import.meta.url), 'utf8').replace(/^<!--.*-->\n/, '')
const ALL_FILES = ['package.json', 'index.js', 'README.md', 'src/errors.js', 'src/catalog.js', 'src/cart.js', 'src/discounts.js',
  'src/orders.js', 'src/storage.js', 'test/catalog.test.js', 'test/cart.test.js', 'test/discounts.test.js', 'test/orders.test.js',
  'test/storage.test.js', 'test/integration.test.js']
const passRun = (command: string, pass: number, fail = 0): BuilderV2Receipt => ({ tool: 'run_tests', ok: fail === 0, changed: false,
  output: { exitCode: fail ? 1 : 0, stdout: `ℹ tests ${pass + fail}\nℹ pass ${pass}\nℹ fail ${fail}\n`, stderr: '', timedOut: false, requestedCommand: command, executedCommand: command } })
const write: BuilderV2Receipt = { tool: 'write_file', ok: true, changed: true, output: { path: 'x' } }

test('OrderFlow is accepted only with all 15 files, both commands passing after the last change, and 30+ tests', () => {
  const tests = passRun('node --test test/*.test.js', 31)
  const app = passRun('node index.js', 0)
  assert.equal(builderV2Acceptance(ORDERFLOW, ALL_FILES, [write, tests, app]).satisfied, true)
  const eightFiles = builderV2Acceptance(ORDERFLOW, ALL_FILES.slice(0, 8), [write, tests, app])
  assert.equal(eightFiles.satisfied, false, 'production: passing tests with 8 of 15 files')
  assert.deepEqual(eightFiles.missingFiles.length, 7)
  assert.deepEqual(builderV2Acceptance(ORDERFLOW, ALL_FILES, [write, passRun('node --test test/*.test.js', 29), app]).testsPassed, 29)
  assert.equal(builderV2Acceptance(ORDERFLOW, ALL_FILES, [write, passRun('node --test test/*.test.js', 29), app]).satisfied, false, 'below 30 tests')
  assert.deepEqual(builderV2Acceptance(ORDERFLOW, ALL_FILES, [write, tests]).pendingCommands, ['node index.js'])
  assert.equal(builderV2Acceptance(ORDERFLOW, ALL_FILES, [tests, app, write]).satisfied, false, 'a change after the runs needs a new run')
})

test('an objective without a checklist keeps plain verified completion', () => {
  assert.equal(builderV2Acceptance('Build storage', [], [write, passRun('node --test', 1)]).satisfied, true)
})

test('explicit repair cannot be declared verified by JavaScript syntax checking alone', () => {
  const original = 'Fix the broken job worker and verify the lock release and error handling.'
  const syntax = passRun('node --check pasted-source.js', 0)
  assert.equal(builderV2Acceptance(original, ['pasted-source.js'], [write, syntax]).satisfied, false,
    'node --check must not satisfy behavioral repair')
  const behavioral = passRun('node --test test/worker.test.js', 3)
  assert.equal(builderV2Acceptance(original, ['pasted-source.js'], [write, syntax, behavioral]).satisfied, true,
    'a real successful behavioral verification receipt after the edit can satisfy repair')
  assert.equal(builderV2Acceptance('Only check syntax of pasted-source.js', ['pasted-source.js'], [write, syntax]).satisfied, true,
    'a syntax-only request may be satisfied by a syntax check')
})

test('a premature finish gets the exact unmet checklist, and the agent completes once it is met', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create these files:\n- src/a.js\n- test/a.test.js\n\nRun:\nnode --test test/*.test.js\n\nWrite at least 2 tests.'
  const prompts: string[] = []
  const decisions = [
    { type: 'tool', action: { tool: 'write_file', path: 'src/a.js', content: 'module.exports = 1\n' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test test/*.test.js' } },
    { type: 'finish', summary: 'done' },
    { type: 'tool', action: { tool: 'write_file', path: 'test/a.test.js', content: "require('node:test')('a', () => {})\n" } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test test/*.test.js' } },
    { type: 'finish', summary: 'done' },
  ]
  const ai = { async generate({ prompt }: { prompt: string }) { prompts.push(prompt); return JSON.stringify(decisions.shift()) } }
  const runner = { async run({ files }: { files: readonly { path: string }[] }) {
    const both = files.length === 2
    return { exitCode: 0, stdout: `ℹ pass ${both ? 2 : 1}\nℹ fail 0\n`, stderr: '', timedOut: false }
  } }
  const outcome = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace).run({ workspaceId: 'w', objective, maxSteps: 12 })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.reason, 'verified')
  const first = JSON.parse(prompts[0])
  assert.deepEqual(first.checklist, { files: ['src/a.js', 'test/a.test.js'], commands: ['node --test test/*.test.js'], minimumTests: 2 })
  const afterPremature = JSON.parse(JSON.parse(prompts[3]).lastReceipt)
  assert.equal(afterPremature.error, 'builder_v2_checklist_incomplete')
  assert.deepEqual(afterPremature.missingFiles, ['test/a.test.js'])
  assert.deepEqual(afterPremature.next, ['write_file'])
})

test('a model that keeps claiming completion ends with the checklist reason, never a false success', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const decisions = [
    { type: 'tool', action: { tool: 'write_file', path: 'src/a.js', content: 'x' } },
    { type: 'tool', action: { tool: 'run_tests', command: 'node --test' } },
  ]
  const ai = { async generate() { return JSON.stringify(decisions.shift() ?? { type: 'finish', summary: 'done' }) } }
  const runner = { async run() { return { exitCode: 0, stdout: 'ℹ pass 1\nℹ fail 0\n', stderr: '', timedOut: false } } }
  const outcome = await new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, runner), workspace)
    .run({ workspaceId: 'w', objective: 'Create these files:\n- src/a.js\n- src/b.js\n\nRun:\nnode --test', maxSteps: 12 })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.reason, 'builder_v2_checklist_incomplete')
  assert.ok(outcome.checkpoint, 'the work done so far is saved')
})
// end of saas/tests/builderV2Acceptance.node.test.ts (if this line is missing, the paste was cut short)
