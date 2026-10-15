import test from 'node:test'
import assert from 'node:assert/strict'
import { builderTaskContract, builderTaskProgress } from '../lib/builder/task-contract.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const run = (command: string, exitCode: number, round: number): BuilderToolTrace => ({
  round, toolId: 'run', input: { command }, ok: exitCode === 0,
  output: { exitCode, timedOut: false, stdout: '', stderr: exitCode ? 'assertion failed' : '' },
})

test('latest executed verification failure prevents earlier smoke-test success from completing task', () => {
  const contract = builderTaskContract('Build index.js and run tests to verify it.')
  const traces = [run('node --test tests/smoke.test.js', 0, 1), run('node --test tests/full.test.js', 1, 2)]
  assert.equal(builderTaskProgress(contract, [], traces).satisfied, false)
  assert.equal(builderTaskProgress(contract, [], [...traces, run('node --test tests/full.test.js', 0, 3)]).satisfied, true)
})

test('a refused duplicate does not invalidate passing verification', () => {
  const contract = builderTaskContract('Run: npm test.')
  const refused: BuilderToolTrace = { round: 2, toolId: 'run', input: { command: 'npm test' },
    ok: false, error: 'builder_repeated_tool_call:run; choose a different next step' }
  assert.equal(builderTaskProgress(contract, [], [run('npm test', 0, 1), refused]).satisfied, true)
})

test('successful unrelated command does not erase a failed required command', () => {
  const contract = builderTaskContract('Run:\nnode --test tests/full.test.js')
  assert.equal(builderTaskProgress(contract, [],
    [run('node --test tests/full.test.js', 1, 1), run('node --version', 0, 2)]).satisfied, false)
})
