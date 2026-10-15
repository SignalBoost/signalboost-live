import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRegressionGate } from '../lib/builder/regression-gate.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'
const command = 'node --test tests/orders.test.js'
const run = (round: number, exitCode: number): BuilderToolTrace => ({
  round, toolId: 'run', input: { command }, ok: exitCode === 0,
  output: { exitCode, timedOut: false, stdout: '', stderr: exitCode ? 'assertion failed' : '' },
})
const edit = (round: number): BuilderToolTrace => ({
  round, toolId: 'edit_file', input: { path: 'src/orders.js' }, ok: true,
})
test('latest failing rerun invalidates a previous passing repair proof', () => {
  const trace = [run(1, 1), edit(2), run(3, 0), run(4, 1)]
  const verdict = evaluateRegressionGate('Fix the failing order tests', trace)
  assert.equal(verdict.satisfied, false)
  if (!verdict.satisfied) assert.match(verdict.reason, /latest rerun/)
})
test('a later actual passing rerun restores verification', () => {
  const trace = [run(1, 1), edit(2), run(3, 0), run(4, 1), run(5, 0)]
  assert.equal(evaluateRegressionGate('Fix the failing order tests', trace).satisfied, true)
})
test('failure after another source edit must be repaired and rerun again', () => {
  const trace = [run(1, 1), edit(2), run(3, 0), edit(4), run(5, 1)]
  assert.equal(evaluateRegressionGate('Fix the failing order tests', trace).satisfied, false)
})
