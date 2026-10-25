import assert from 'node:assert/strict'
import test from 'node:test'
import { builderV2RecurringFailures } from '../lib/builder/agent-v2.ts'

const failed = (name: string) => ({
  tool: 'run_tests' as const, ok: false,
  output: { stdout: 'not ok 1 - ' + name + '\n', stderr: '' },
})
test('persistent failing test survives unrelated successful commands and source revisions', () => {
  const receipts = [
    failed('cancellation restores inventory'),
    { tool: 'edit_file' as const, ok: true, output: {} },
    failed('cancellation restores inventory'),
    { tool: 'run_tests' as const, ok: true, output: {} },
    failed('cancellation restores inventory'),
  ]
  assert.deepEqual(builderV2RecurringFailures(receipts), [
    { name: 'cancellation restores inventory', occurrences: 3 },
  ])
})

test('deduplicates repeated TAP lines in one failed command and ignores transient failures', () => {
  const receipts = [
    { tool: 'run_tests' as const, ok: false, output: { stdout: 'not ok 1 - returns fine\nnot ok 1 - returns fine' } },
    failed('returns fine'),
    failed('another error'),
  ]
  assert.deepEqual(builderV2RecurringFailures(receipts), [])
  assert.deepEqual(builderV2RecurringFailures(receipts, 2), [
    { name: 'returns fine', occurrences: 2 },
  ])
})
