// saas/tests/builderTestOnlyCompletion.node.test.ts
//
// Production 2026-10-13: a job finished its work (a real run, 4 tests passed, 0 failed, exit 0) and still ended
// builder_stalled_repeated_inspection. Any "fix" request is a repair, and a repair was only accepted after a proof
// failed before the change and passed after it. Rewriting tests that were not failing (console.assert does not throw)
// can never produce that failure, so the passing run was never accepted and the resident re-inspected until stopped.
// #4278 special-cased one wording (console.assert + node:test + node:assert/strict). The general rule: a change that
// touched only test files, verified by the requested passing run after the last change, is complete.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const OLD_TESTS = "const { add } = require('./math.js')\nconsole.assert(add(1, 2) === 3)\nconsole.assert(add(0, 0) === 0)\nconsole.assert(add(-1, 1) === 0)\nconsole.assert(add(2, 2) === 4)\n"
const NEW_TESTS = "const test = require('node:test')\nconst assert = require('node:assert/strict')\nconst { add } = require('./math.js')\ntest('a', () => assert.equal(add(1, 2), 3))\ntest('b', () => assert.equal(add(0, 0), 0))\ntest('c', () => assert.equal(add(-1, 1), 0))\ntest('d', () => assert.equal(add(2, 2), 4))\n"
const PASS_FOUR = 'ok 1 - a\nok 2 - b\nok 3 - c\nok 4 - d\n# tests 4\n# pass 4\n# fail 0\n'

const WORDINGS = [
  'Fix test.js: convert it to four node:test tests and verify at least 4 tests pass with node --test test.js',
  'Repair the test suite in test.js so it uses node:test with four independent tests. Run node --test test.js.',
  'Inspect the existing project and fix test.js. Replace console.assert with four independent tests using node:test and node:assert/strict. Run node --test test.js.',
]

async function residency(objective: string, script: readonly unknown[], stdout = PASS_FOUR, exitCode = 0) {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'math.js', 'exports.add = (a, b) => a + b\n')
  await workspace.writeFile('w', 'test.js', OLD_TESTS)
  let calls = 0
  const ai = { async generate() {
    calls += 1
    // After the scripted work, the resident keeps inspecting, like the Production job.
    return JSON.stringify(script[calls - 1] ?? (calls % 2
      ? { type: 'tool', toolId: 'read_file', input: { path: 'test.js' } }
      : { type: 'tool', toolId: 'list_files', input: {} }))
  } }
  const runner = { async run() { return { exitCode, stdout, stderr: '', timedOut: false } } }
  const result = await new BuilderToolLoop(ai as any, workspace, runner as any).run({
    objective, workspaceId: 'w', maxRounds: 64, deadlineAtMs: Date.now() + 10_000_000, minimumStepMs: 1,
  })
  return { result, calls }
}

const REWRITE_TESTS = [
  { type: 'tool', toolId: 'read_file', input: { path: 'test.js' } },
  { type: 'tool', toolId: 'write_file', input: { path: 'test.js', content: NEW_TESTS } },
  { type: 'tool', toolId: 'run', input: { command: 'node --test test.js' } },
]

for (const objective of WORDINGS) {
  test(`a test-only change completes right after its passing run: ${objective.slice(0, 60)}`, async () => {
    const { result, calls } = await residency(objective, REWRITE_TESTS)
    assert.equal(result.ok, true, 'error' in result ? result.error : '')
    assert.equal(calls, 3, 'no further inspection after the passing run')
    assert.deepEqual(result.trace.map(item => `${item.toolId}:${item.ok}`), ['read_file:true', 'write_file:true', 'run:true'])
  })
}

test('a failing run after the test change is not completion', async () => {
  const { result } = await residency(WORDINGS[0], REWRITE_TESTS, '# tests 4\n# pass 3\n# fail 1\n', 1)
  assert.equal(result.ok, false)
})

test('a requested minimum the run does not meet is not completion', async () => {
  const { result } = await residency(WORDINGS[0], REWRITE_TESTS, '# tests 2\n# pass 2\n# fail 0\n')
  assert.equal(result.ok, false)
})

test('a run that proves no passing test is not completion', async () => {
  const { result } = await residency('Repair the test suite in test.js so it uses node:test. Run node --test test.js.', REWRITE_TESTS, '# tests 0\n# pass 0\n# fail 0\n')
  assert.equal(result.ok, false)
})

test('a source change still needs a failing proof before the change', async () => {
  const { result } = await residency('Fix math.js so add handles negatives and verify 4 tests pass with node --test test.js', [
    { type: 'tool', toolId: 'read_file', input: { path: 'math.js' } },
    { type: 'tool', toolId: 'edit_file', input: { path: 'math.js', search: 'a + b', replace: 'Number(a) + Number(b)' } },
    { type: 'tool', toolId: 'run', input: { command: 'node --test test.js' } },
  ])
  assert.equal(result.ok, false, 'a source repair with no reproduced failure is not accepted')
})

test('a passing baseline run before the test change still completes after the change', async () => {
  const { result } = await residency(WORDINGS[0], [
    { type: 'tool', toolId: 'run', input: { command: 'node --test test.js' } },
    ...REWRITE_TESTS,
  ])
  assert.equal(result.ok, true, 'error' in result ? result.error : '')
})
// Codex review on #4293: a passing run of another suite must not verify a changed test file it never executed.
test('a passing run that does not execute the changed test file is not completion', async () => {
  for (const command of ['node --test unrelated.test.js', 'npm test', 'node --test']) {
    const { result } = await residency('Repair the test suite in test.js so it uses node:test with four independent tests. Run node --test test.js.', [
      { type: 'tool', toolId: 'write_file', input: { path: 'test.js', content: 'not valid javascript (' } },
      { type: 'tool', toolId: 'run', input: { command } },
    ])
    assert.equal(result.ok, false, command)
  }
})

test('the changed test file may be named with a leading ./', async () => {
  const { result } = await residency(WORDINGS[1], [
    REWRITE_TESTS[1],
    { type: 'tool', toolId: 'run', input: { command: 'node --test ./test.js' } },
  ])
  assert.equal(result.ok, true, 'error' in result ? result.error : '')
})

// end of saas/tests/builderTestOnlyCompletion.node.test.ts (if this line is missing, the paste was cut short)
