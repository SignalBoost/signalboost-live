import test from 'node:test'
import assert from 'node:assert/strict'
import { builderV2FailingTestSummary } from '../lib/builder/agent-v2.ts'

test('failure summary preserves all Node TAP failure names, including those omitted from a truncated output', () => {
  const diagnostics = [
    '✔ borrow deducts inventory',
    '✖ borrow sets due date 14 days out (5ms)',
    '✖ borrow creates a transaction (6ms)',
    ...Array.from({ length: 150 }, (_, i) => 'diagnostic detail ' + i),
    'not ok 19 - transaction log lists all transactions',
    '✖ borrow creates a transaction (6ms)',
  ].join('\n')
  assert.deepEqual(builderV2FailingTestSummary(diagnostics), [
    'borrow sets due date 14 days out (5ms)',
    'borrow creates a transaction (6ms)',
    'transaction log lists all transactions',
  ])
})
test('failure summary rejects passing tests and bounds the number of distinct failures', () => {
  assert.deepEqual(builderV2FailingTestSummary('✔ passed\nok 1 - passed\n', 3), [])
  assert.equal(builderV2FailingTestSummary('✖ one\n✖ two\n✖ three', 2).length, 2)
})
