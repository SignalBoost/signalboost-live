// saas/tests/builderV2RepairConvergence.node.test.ts
// Production 2026-10-24 (LibraryFlow, run 3): 186 steps, about 66 edits and 35 test runs in 60 minutes ended at
// 25 of 28 passing. The harness kept no per-run score, never noticed repairs were not improving, could not undo a
// change that made things worse, and gave the model raw output instead of each failing assertion.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BuilderV2Agent, type BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'
import { workspaceDigest } from '../lib/builder/checkpoint.ts'
import { BuilderV2Dispatcher, type BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderRunnerPort } from '../lib/builder/contracts.ts'
import { BUILDER_STUCK_RUNS, builderAssertionSnippet, builderFailingTests, builderTestProgress, builderTestRunScore } from '../lib/builder/test-progress.ts'

// The node:test spec output of the LibraryFlow run (shape kept, names from the real report).
const specOutput = [
  '> libraryflow@1.0.0 test', '> node --test test/*.test.js', '',
  '✔ borrow deducts inventory (1.35ms)',
  '✖ overdue return calculates fine at 0.50 per day (1.76ms)',
  '✖ reports: outstanding fines (0.48ms)',
  'ℹ tests 28', 'ℹ suites 0', 'ℹ pass 25', 'ℹ fail 3', '',
  '✖ failing tests:', '',
  'test at test/return.test.js:20:1',
  '✖ overdue return calculates fine at 0.50 per day (1.76ms)',
  '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '',
  '  1 !== 1.5', '',
  '      at TestContext.<anonymous> (/tmp/cos-builder/test/return.test.js:27:10)',
  '      at Test.runInAsyncScope (node:async_hooks:227:14) {',
  '    generatedMessage: true,', "    code: 'ERR_ASSERTION',", '    actual: 1,', '    expected: 1.5,', "    operator: 'strictEqual'", '  }', '',
  'test at test/reports.test.js:44:1',
  '✖ reports: outstanding fines (0.48ms)',
  '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '',
  '      at TestContext.<anonymous> (/tmp/cos-builder/test/reports.test.js:50:10) {',
  '    actual: undefined,', '    expected: 2,', '  }',
].join('\n')
const run = (stdout: string, ok = false): BuilderV2Receipt => ({ tool: 'run_tests', ok, changed: false,
  output: { exitCode: ok ? 0 : 1, stdout, stderr: '', timedOut: false, requestedCommand: 'npm test', executedCommand: 'npm test' } })
const edit = (): BuilderV2Receipt => ({ tool: 'edit_file', ok: true, changed: true, output: { path: 'src/return.js' } })
const scored = (passed: number, failed: number) => run(`ℹ pass ${passed}\nℹ fail ${failed}`, failed === 0)

test('each run has its own score, from spec, TAP or a compacted receipt', () => {
  assert.deepEqual(builderTestRunScore(run(specOutput)), { passed: 25, failed: 3 })
  assert.deepEqual(builderTestRunScore(run('TAP version 13\nok 1 - a\nnot ok 2 - b\n# pass 1\n# fail 1')), { passed: 1, failed: 1 })
  assert.deepEqual(builderTestRunScore({ tool: 'run_tests', ok: false, changed: false, output: { exitCode: 1, score: { passed: 7, failed: 2 } } }), { passed: 7, failed: 2 })
  assert.equal(builderTestRunScore(run('Report printed')), null)
})

test('the best score and the runs since that did not beat it', () => {
  const progress = builderTestProgress([scored(20, 8), edit(), scored(25, 3), edit(), scored(23, 5), edit(), scored(25, 3), edit(), scored(24, 4)])
  assert.deepEqual(progress.best, { passed: 25, failed: 3 })
  assert.equal(progress.bestAt, 2)
  assert.deepEqual(progress.latest, { passed: 24, failed: 4 })
  assert.equal(progress.runsWithoutImprovement, 3)
})

test('each failing test is named with its assertion location, expected and actual', () => {
  const tests = builderFailingTests(run(specOutput), ['test/return.test.js', 'test/reports.test.js', 'src/return.js'])
  assert.deepEqual(tests, [
    { name: 'overdue return calculates fine at 0.50 per day', location: 'test/return.test.js:27',
      message: 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', expected: '1.5', actual: '1' },
    { name: 'reports: outstanding fines', location: 'test/reports.test.js:50',
      message: 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', expected: '2', actual: 'undefined' },
  ])
  const tap = builderFailingTests(run("TAP version 13\nnot ok 3 - fine is charged\n  ---\n  location: '/tmp/x/test/return.test.js:20:1'\n  error: 'Expected values to be strictly equal'\n  expected: 1.5\n  actual: 1\n  stack: |-\n    TestContext.<anonymous> (/tmp/x/test/return.test.js:27:10)\n  ...\n# pass 0\n# fail 1"), ['test/return.test.js'])
  assert.deepEqual(tap, [{ name: 'fine is charged', location: 'test/return.test.js:27', message: 'Expected values to be strictly equal', expected: '1.5', actual: '1' }])
  assert.equal(builderAssertionSnippet('a\nb\nc\nd', 3, 1), '2  b\n3> c\n4  d')
})

const localRunner: BuilderRunnerPort = {
  async run({ command, files }) {
    const dir = mkdtempSync(join(tmpdir(), 'builder-v2-converge-'))
    try {
      for (const file of files) {
        mkdirSync(dirname(join(dir, file.path)), { recursive: true })
        writeFileSync(join(dir, file.path), file.content)
      }
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))
      const result = spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 60_000, env })
      return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, timedOut: false }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  },
}

const objective = ['# FineFlow', 'Build a small FineFlow application using Node.js.', 'Create all 3 files:', '```text',
  'fineflow/', '├── package.json', '├── src', '│   └── fine.js', '└── test', '    └── fine.test.js', '```',
  'Implement at least **3 meaningful automated tests**.', '## Mandatory verification', 'Execute:', '```bash', 'npm test', '```'].join('\n')
const testFile = "const test = require('node:test')\nconst assert = require('node:assert')\nconst { fine, days } = require('../src/fine.js')\n"
  + "test('no fine on time', () => assert.equal(fine(0), 0))\ntest('fine is 0.50 per day', () => assert.equal(fine(3), 1.5))\ntest('days are whole', () => assert.equal(days(36), 1))\n"
// Two of three pass: the per-day rate is wrong.
const source = 'function fine(late) { return late * 0.25 * 2 > 0 ? late * 0.4 : 0 }\nfunction days(hours) { return Math.floor(hours / 24) }\nmodule.exports = { fine, days }\n'

async function project(id: string) {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile(id, 'package.json', '{"name":"fineflow","version":"1.0.0","scripts":{"test":"node --test test/*.test.js"}}\n')
  await workspace.writeFile(id, 'src/fine.js', source)
  await workspace.writeFile(id, 'test/fine.test.js', testFile)
  return workspace
}

test('a change that passes fewer tests is undone to the best version, and the model is told why', async () => {
  const workspace = await project('w')
  const prompts: Record<string, unknown>[] = []
  const replies = [
    // Breaks days() too: 1 of 3 passing, worse than the 2 of 3 best.
    JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/fine.js', search: 'Math.floor(hours / 24)', replace: 'hours' } }),
    // The real fix, applied to the restored best version.
    JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/fine.js', search: 'late * 0.4', replace: 'late * 0.5' } }),
  ]
  const agent = new BuilderV2Agent({ async generate(input) { prompts.push(JSON.parse(input.prompt)); return replies.shift() ?? null } },
    new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 'w', objective, maxSteps: 6, retryDelay: async () => {} })
  assert.equal(outcome.ok, true, outcome.reason)
  const restore = outcome.steps.find(step => (step.output as { restoredBest?: unknown } | undefined)?.restoredBest === true)
  assert.ok(restore, 'the host restored the best version')
  assert.equal((await workspace.readFile('w', 'src/fine.js'))?.content, source.replace('late * 0.4', 'late * 0.5'))
  const told = prompts.find(prompt => prompt.regressionUndone)
  assert.match(String((told?.regressionUndone as { message?: unknown }).message), /made the tests worse \(1 passing, the best version had 2\)/)
  assert.equal(prompts.filter(prompt => prompt.regressionUndone).length, 1, 'told once')
  const first = prompts[0]
  assert.deepEqual((first.failingTests as Array<{ name: string; expected?: string; actual?: string }>).map(({ name, expected, actual }) => ({ name, expected, actual })),
    [{ name: 'fine is 0.50 per day', expected: '1.5', actual: '1.2000000000000002' }])
  assert.deepEqual(first.testScore, { passing: 2, failing: 1, bestPassing: 2, bestFailing: 1, runsWithoutImprovement: 0 })
})

test('runs that never beat the best score get the step-back instruction, and compacted runs keep their score', async () => {
  const workspace = await project('s')
  const prompts: Record<string, unknown>[] = []
  let n = 0
  // Edits that change nothing about the result: the classic doom loop.
  const agent = new BuilderV2Agent({ async generate(input) {
    prompts.push(JSON.parse(input.prompt))
    n++
    return JSON.stringify({ type: 'tool', action: { tool: 'edit_file', path: 'src/fine.js', search: n === 1 ? 'module.exports' : `// try ${n - 1}\nmodule.exports`, replace: `// try ${n}\nmodule.exports` } })
  } }, new BuilderV2Dispatcher(workspace, localRunner), workspace)
  const outcome = await agent.run({ workspaceId: 's', objective, maxSteps: BUILDER_STUCK_RUNS + 2, retryDelay: async () => {} })
  const stuck = prompts.findIndex(prompt => prompt.stuck)
  assert.ok(stuck > 0, 'the step-back instruction appears')
  assert.match(String((prompts[stuck].stuck as { instruction?: unknown }).instruction), new RegExp(`last ${BUILDER_STUCK_RUNS} test runs did not beat the best result \\(2 passing, 1 failing\\)`))
  assert.ok(prompts.slice(0, stuck).every(prompt => !prompt.stuck), 'not before the threshold')
  const scores = (outcome.checkpoint?.steps ?? []).filter(step => step.tool === 'run_tests').map(builderTestRunScore)
  assert.ok(scores.length > BUILDER_STUCK_RUNS && scores.every(score => score?.passed === 2 && score.failed === 1), 'every saved run keeps its score')
  assert.ok((outcome.checkpoint?.steps ?? []).some(step => step.tool === 'run_tests' && !(step.output as { stdout?: unknown }).stdout), 'older runs were compacted')
})

test('scores are compared only for the same command: one test file is not a regression of the full suite', () => {
  const single: BuilderV2Receipt = { tool: 'run_tests', ok: true, changed: false,
    output: { exitCode: 0, stdout: 'ℹ pass 2\nℹ fail 0', stderr: '', timedOut: false, requestedCommand: 'node --test test/return.test.js' } }
  const steps = [scored(25, 3), edit(), single]
  assert.deepEqual(builderTestProgress(steps).best, { passed: 2, failed: 0 })
  assert.deepEqual(builderTestProgress(steps, 'npm test').best, { passed: 25, failed: 3 })
  assert.equal(builderTestProgress(steps, 'npm test').runsWithoutImprovement, 0)
})

// A real Node run of a describe/it suite: the failing assertion is indented and the suite only says a subtest failed.
test('failures inside describe/it suites are named with their own expected and actual (Codex on #4868)', () => {
  const tap = readFileSync(new URL('./fixtures/builder-tap-nested-failure.txt', import.meta.url), 'utf8')
  assert.deepEqual(builderFailingTests(run(tap), ['test/calc.test.js']),
    [{ name: 'adds', location: 'test/calc.test.js:5', message: '2 == 3', expected: '3', actual: '2' }])
})

test('an interrupted rollback is checkpointed file by file, so the job stays resumable (Codex on #4868)', async () => {
  const workspace = await project('r')
  await workspace.writeFile('r', 'src/extra.js', 'module.exports = 1\n')
  // One reply breaks days() and changes a second file: 1 of 3 passing, so the host restores both files.
  const regress = JSON.stringify({ type: 'tools', actions: [
    { tool: 'edit_file', path: 'src/fine.js', search: 'Math.floor(hours / 24)', replace: 'hours' },
    { tool: 'edit_file', path: 'src/extra.js', search: '1', replace: '2' },
  ] })
  // The model only edits; every write_file here is the host restoring a file. The second one is cut off the way a
  // slice deadline cuts off a dispatch (checkBuilderInferenceDeadline throws before the tool runs).
  const dispatcher = new BuilderV2Dispatcher(workspace, localRunner)
  const dispatch = dispatcher.dispatch.bind(dispatcher)
  let restores = 0
  dispatcher.dispatch = async (id, action, options) => {
    if (action.tool === 'write_file' && ++restores === 2) throw new Error('builder_turn_timeout')
    return dispatch(id, action, options)
  }
  let last: BuilderV2Checkpoint | undefined
  const agent = new BuilderV2Agent({ async generate() { return regress } }, dispatcher, workspace)
  await assert.rejects(agent.run({ workspaceId: 'r', objective, maxSteps: 3, retryDelay: async () => {},
    onCheckpoint: async checkpoint => { last = checkpoint } }), /builder_turn_timeout/)
  assert.ok(last?.steps.some(step => (step.output as { restoredBest?: unknown } | undefined)?.restoredBest === true))
  assert.equal(last?.workspaceDigest, await workspaceDigest(workspace, 'r'), 'the saved checkpoint matches the partly restored workspace')
})
