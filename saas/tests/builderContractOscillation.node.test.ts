// saas/tests/builderContractOscillation.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertionOutcomes, detectContractOscillation, formatContractOscillation } from '../lib/builder/contract-oscillation.ts'
import type { BuilderToolTrace } from '../lib/builder/contracts.ts'

const toolLoop = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

const COMMAND = 'node --test expenses.test.js'
const failedRun = (stdout: string, command = COMMAND): BuilderToolTrace =>
  ({ round: 1, toolId: 'run', input: { command }, ok: false, output: { stdout, stderr: '', exitCode: 1, timedOut: false } })
const passedRun = (stdout: string, command = COMMAND): BuilderToolTrace =>
  ({ round: 1, toolId: 'run', input: { command }, ok: true, output: { stdout, stderr: '', exitCode: 0, timedOut: false } })

// The exact production runs: the implementation was flipped between two output contracts, so one
// assertion started passing while another stopped.
const RUN_2 = [
  '✔ totals by category and overall for normal input (56.493149ms)',
  '✖ sorts categories alphabetically (36.664994ms)',
  '✖ supports CRLF line endings (37.597228ms)',
  '✔ rejects invalid dates with nonzero exit code (37.855498ms)',
].join('\n')
const RUN_4 = [
  '✖ totals by category and overall for normal input (37.566642ms)',
  '✔ sorts categories alphabetically (30.127329ms)',
  '✖ supports CRLF line endings (29.388774ms)',
  '✔ rejects invalid dates with nonzero exit code (26.935766ms)',
].join('\n')

test('assertion outcomes are read from node test output by symbol, not by position', () => {
  const outcomes = assertionOutcomes(RUN_2)
  assert.deepEqual([...outcomes.passed].sort(), ['rejects invalid dates with nonzero exit code', 'totals by category and overall for normal input'])
  assert.deepEqual([...outcomes.failed].sort(), ['sorts categories alphabetically', 'supports CRLF line endings'])
  const empty = assertionOutcomes('no recognizable test output at all')
  assert.equal(empty.passed.size, 0)
  assert.equal(empty.failed.size, 0)
})

test('the reported production oscillation is detected with both directions named', () => {
  const signal = detectContractOscillation([failedRun(RUN_2), failedRun(RUN_4)])
  assert.ok(signal)
  assert.equal(signal.command, COMMAND)
  assert.equal(signal.failures, 2)
  assert.deepEqual(signal.recovered, ['sorts categories alphabetically'])
  assert.deepEqual(signal.regressed, ['totals by category and overall for normal input'])
})

test('steady progress toward green is never called a contradiction', () => {
  const first = ['✖ a (1ms)', '✖ b (1ms)', '✔ c (1ms)'].join('\n')
  const second = ['✔ a (1ms)', '✖ b (1ms)', '✔ c (1ms)'].join('\n')
  assert.equal(detectContractOscillation([failedRun(first), failedRun(second)]), null)
})

test('a single failure, a passing rerun, and unrelated commands raise no signal', () => {
  assert.equal(detectContractOscillation([failedRun(RUN_2)]), null)
  assert.equal(detectContractOscillation([failedRun(RUN_2), passedRun(RUN_4)]), null)
  assert.equal(detectContractOscillation([failedRun(RUN_2), failedRun(RUN_4, 'node other.test.js')]), null)
  assert.equal(detectContractOscillation([]), null)
})

test('the instruction tells the model to fix the contract once, including in the test file', () => {
  const message = formatContractOscillation(detectContractOscillation([failedRun(RUN_2), failedRun(RUN_4)]))
  assert.match(message, /CONTRACT CONTRADICTION/)
  assert.match(message, /sorts categories alphabetically/)
  assert.match(message, /totals by category and overall for normal input/)
  assert.match(message, /test file/)
  assert.equal(formatContractOscillation(null), '')
})

test('the round prompt carries the signal and the regression is deployment-gated', () => {
  assert.match(toolLoop, /formatContractOscillation\(detectContractOscillation\(trace\)\)/)
  assert.match(gate, /tests\/builderContractOscillation\.node\.test\.ts/)
})
