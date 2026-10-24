import test from 'node:test'
import assert from 'node:assert/strict'
import { builderV2FailingTestSummary } from '../lib/builder/agent-v2.ts'

test('captures failed Node TAP names even when the middle of output is truncated', () => {
  const output = [
    '✔ catalog adds a book',
    '✖ reports total borrowed (5ms)',
    ...Array.from({ length: 150 }, (_, i) => 'diagnostic detail ' + i),
    'not ok 19 - reports remaining inventory',
    '✖ reports total borrowed (5ms)',
  ].join('\n')
  assert.deepEqual(builderV2FailingTestSummary(output), [
    'reports total borrowed (5ms)',
    'reports remaining inventory',
  ])
})

test('ignores passing assertions and bounds distinct failures', () => {
  assert.deepEqual(builderV2FailingTestSummary('✔ passed\nok 1 - passed\n'), [])
  assert.deepEqual(builderV2FailingTestSummary('✖ one\n✖ two\n✖ three', 2), ['one', 'two'])
})
