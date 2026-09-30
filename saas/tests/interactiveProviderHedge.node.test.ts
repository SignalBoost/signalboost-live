// saas/tests/interactiveProviderHedge.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { firstUsefulWithHedge } from '../lib/ai/interactiveProviderHedge.ts'

const later = <T>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))
const useful = (value: string | null) => Boolean(value && value.trim())

test('a primary that answers in normal time never starts the backup', async () => {
  let backupCalls = 0
  const outcome = await firstUsefulWithHedge<string>({
    primary: () => later(20, 'primary answer'),
    backup: async () => { backupCalls += 1; return 'backup answer' },
    hedgeAfterMs: 200,
    isUseful: useful,
  })
  assert.equal(outcome.result, 'primary answer')
  assert.equal(outcome.winner, 'primary')
  assert.equal(outcome.backupStarted, false)
  assert.equal(backupCalls, 0)
})

test('production shape: a stalled primary is overtaken by the backup instead of ending in a refusal', async () => {
  // 2026-09-29: the managed provider call ran to its full limit and aborted with no answer.
  const outcome = await firstUsefulWithHedge<string>({
    primary: () => later(400, null),
    backup: () => later(30, 'backup answer'),
    hedgeAfterMs: 50,
    isUseful: useful,
  })
  assert.equal(outcome.result, 'backup answer')
  assert.equal(outcome.winner, 'backup')
  assert.equal(outcome.backupStarted, true)
})

test('a slow primary that still finishes first after the hedge point wins', async () => {
  const outcome = await firstUsefulWithHedge<string>({
    primary: () => later(80, 'primary answer'),
    backup: () => later(400, 'backup answer'),
    hedgeAfterMs: 40,
    isUseful: useful,
  })
  assert.equal(outcome.result, 'primary answer')
  assert.equal(outcome.winner, 'primary')
})

test('a primary that fails fast goes straight to the backup; errors never escape the helper', async () => {
  const outcome = await firstUsefulWithHedge<string>({
    primary: async () => { throw new Error('http 503') },
    backup: () => later(10, 'backup answer'),
    hedgeAfterMs: 1000,
    isUseful: useful,
  })
  assert.equal(outcome.result, 'backup answer')
  assert.equal(outcome.winner, 'backup')
})

test('when neither provider answers the outcome is honestly empty', async () => {
  const outcome = await firstUsefulWithHedge<string>({
    primary: () => later(60, ''),
    backup: () => later(10, null),
    hedgeAfterMs: 20,
    isUseful: useful,
  })
  assert.equal(outcome.winner, 'none')
  assert.equal(useful(outcome.result), false)
})
