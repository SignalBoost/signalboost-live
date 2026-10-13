// tests/labCustomerTeacherSpend.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCustomerTeacherRows, parsePrompts } from '../lib/ai/cos/labCustomerTraining.ts'

test('teacher prompts are trimmed and deduplicated before any provider invocation', () => {
  assert.deepEqual(parsePrompts(' A \nA\n B \n\nB'), ['A', 'B'])
})

test('teacher generation preserves successful rows, records failures and reports progress', async () => {
  const progress: Array<[number, number]> = []
  const invoked: string[] = []
  const result = await buildCustomerTeacherRows({
    teacher: { id: 'customer-teacher', provider: 'customer-provider', model: 'customer-model' },
    prompts: ['first', 'second', 'third'],
    concurrency: 2,
    generate: async prompt => {
      invoked.push(prompt)
      if (prompt === 'second') throw new Error('provider unavailable')
      return ' answer to ' + prompt + ' '
    },
    onProgress: (done, total) => progress.push([done, total]),
  })
  assert.deepEqual(result.rows.map(row => row.prompt), ['first', 'third'])
  assert.deepEqual(result.rows.map(row => row.response), ['answer to first', 'answer to third'])
  assert.equal(result.failures, 1)
  assert.equal(result.rows[0].provider, 'customer-provider')
  assert.equal(result.rows[0].teacherId, 'customer-teacher')
  assert.equal(invoked.length, 3)
  assert.equal(progress.length, 3)
  assert.deepEqual(progress.at(-1), [3, 3])
  assert.match(result.datasetHash, /^[a-f0-9]{64}$/)
})

test('empty teacher output does not become valid curriculum', async () => {
  const result = await buildCustomerTeacherRows({
    teacher: { id: 't', provider: 'p', model: 'm' },
    prompts: ['one'],
    generate: async () => '  ',
  })
  assert.equal(result.rows.length, 0)
  assert.equal(result.failures, 1)
})
