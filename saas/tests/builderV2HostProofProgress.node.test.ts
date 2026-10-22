import test from 'node:test'
import assert from 'node:assert/strict'
import { passedOnCurrentRevision } from '../lib/builder/agent-v2-job-cycle.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'

const run = (ok: boolean, exitCode?: number, timedOut?: boolean): BuilderV2Receipt =>
  ({ tool: 'run_tests', ok, changed: false, output: { requestedCommand: 'npm test', exitCode, timedOut } }) as BuilderV2Receipt

test('continuation progress requires proved host execution, not only receipt.ok', () => {
  for (const receipt of [run(true), run(true, 1, false), run(true, 0, true), run(false, 0, false)]) {
    assert.equal(passedOnCurrentRevision([receipt]).size, 0)
  }
  assert.deepEqual([...passedOnCurrentRevision([run(true, 0, false)])], ['npm test'])
})

test('a later failed run revokes progress proof', () => {
  assert.equal(passedOnCurrentRevision([run(true, 0, false), run(false, 1, false)]).size, 0)
  assert.equal(passedOnCurrentRevision([run(true, 0, false), run(true, 0, true)]).size, 0)
})

test('source changes invalidate earlier host proof', () => {
  const edit = { tool: 'edit_file', changed: true, ok: true, output: { path: 'src/orders.js' } } as BuilderV2Receipt
  assert.equal(passedOnCurrentRevision([run(true, 0, false), edit]).size, 0)
  assert.equal(passedOnCurrentRevision([run(true, 0, false), edit, run(true, 0, false)]).size, 1)
})
