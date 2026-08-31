import assert from 'node:assert/strict'
import test from 'node:test'
import { fallbackFollowups, repairFollowups } from '../lib/ai/cos/suggestedFollowupPolicy.ts'

test('measurement questions do not fall back to history chips', () => {
  const chips = fallbackFollowups('is there a pay gap btw women and men in the US?')
  assert.equal(chips.length, 2)
  assert.ok(chips.every(item => item.endsWith('?')))
  assert.ok(chips.every(item => !/happened next|main people involved/i.test(item)))
  assert.ok(chips.some(item => /measure/i.test(item)))
  assert.ok(chips.some(item => /uncontrolled|unmeasured/i.test(item)))
})

test('repair chips ask for sources instead of repeating the failed question', () => {
  const chips = repairFollowups('is there a pay gap btw women and men in the US?')
  assert.equal(chips.length, 2)
  assert.ok(chips.every(item => item.endsWith('?')))
  assert.ok(chips.every(item => !/^Did you mean/i.test(item)))
})
