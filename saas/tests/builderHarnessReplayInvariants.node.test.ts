import assert from 'node:assert/strict'
import test from 'node:test'
import { passedOnCurrentRevision, builderV2TimeoutDisposition, builderV2RecoverableEarlyStop } from '../lib/builder/agent-v2-job-cycle.ts'

type Receipts = Parameters<typeof passedOnCurrentRevision>[0]
const run = (command: string, ok: boolean, exitCode: number, timedOut = false) =>
  ({tool: 'run_tests', changed: false, ok, output: {requestedCommand: command, exitCode, timedOut}})
const edit = () => ({tool: 'edit_file', changed: true, ok: true, output: {path: 'src/reports.js'}})
const evaluate = (...receipts: object[]) => passedOnCurrentRevision(receipts as unknown as Receipts)

test('LibraryFlow replay: a previous green suite is invalidated by any new source edit', () => {
  const earlier = run('node --test test/*.test.js', true, 0)
  assert.deepEqual([...evaluate(earlier)], ['node --test test/*.test.js'])
  assert.equal(evaluate(earlier, edit(), run('npm test', false, 1)).size, 0)
})

test('LibraryFlow replay: passing a command on the final revision does not forgive another failed command', () => {
  const commands = evaluate(edit(), run('node index.js', true, 0),
    run('node --test test/*.test.js', true, 0), run('npm test', false, 1))
  assert.equal(commands.has('node index.js'), true)
  assert.equal(commands.has('node --test test/*.test.js'), true)
  assert.equal(commands.has('npm test'), false)
})

test('LibraryFlow replay: a timed-out command never counts as verified', () => {
  assert.equal(evaluate(run('npm test', true, 0, true)).has('npm test'), false)
  assert.equal(evaluate(run('npm test', true, 0), run('npm test', false, 1)).has('npm test'), false)
})

test('LibraryFlow replay: transport deadline with a durable checkpoint pauses, not falsely completes', () => {
  assert.equal(builderV2TimeoutDisposition({unavailable: true, madeProgress: false,
    deadline: true, checkpointPresent: true}), 'pause')
  assert.equal(builderV2TimeoutDisposition({unavailable: true, madeProgress: false,
    deadline: false, checkpointPresent: true}), 'fail')
  assert.equal(builderV2TimeoutDisposition({unavailable: true, madeProgress: true,
    deadline: false, checkpointPresent: true}), 'pause')
  assert.equal(builderV2TimeoutDisposition({unavailable: true, madeProgress: true,
    deadline: true, checkpointPresent: false}), 'fail')
})

test('LibraryFlow replay: failed verification is not itself progress that extends invalid completion', () => {
  assert.equal(builderV2RecoverableEarlyStop('builder_v2_unverified_completion', false, true), false)
  assert.equal(builderV2RecoverableEarlyStop('builder_v2_unverified_completion', true, true), true)
  assert.equal(builderV2RecoverableEarlyStop('builder_v2_unverified_completion', true, false), false)
})
