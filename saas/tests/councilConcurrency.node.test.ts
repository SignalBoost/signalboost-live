import assert from 'node:assert/strict'
import test from 'node:test'
import { runCouncilMembersConcurrently } from '../lib/ai/cos/councilConcurrency.ts'

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('Council members start concurrently while results preserve member order', async () => {
  let active = 0
  let maxActive = 0

  const member = (value: string, delayMs: number) => async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await wait(delayMs)
    active -= 1
    return value
  }

  const results = await runCouncilMembersConcurrently([
    member('sre', 35),
    member('architect', 10),
    member('skeptic', 20),
  ])

  assert.ok(maxActive >= 2, `expected overlapping Council execution, saw maxActive=${maxActive}`)
  assert.deepEqual(results, ['sre', 'architect', 'skeptic'])
})

test('one Council member failure does not abort the other opinions', async () => {
  const results = await runCouncilMembersConcurrently([
    async () => 'sre',
    async () => { throw new Error('member failed') },
    async () => 'skeptic',
  ])

  assert.deepEqual(results, ['sre', 'skeptic'])
})
