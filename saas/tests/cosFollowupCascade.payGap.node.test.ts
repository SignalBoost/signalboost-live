import assert from 'node:assert/strict'
import test from 'node:test'
import { fallbackFollowups, repairFollowups, validateSuggestedFollowups } from '../lib/ai/cos/suggestedFollowupPolicy.ts'

const original = 'is there a pay gap btw women and men in the US?'
const firstFollowup = 'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?'

test('pay-gap cascade cannot jump to unrelated empirical-research or validation topics', () => {
  const stepTwo = validateSuggestedFollowups(
    ['What does empirical research mean in medicine?', 'Which validation framework is used for agent-based simulations?'],
    firstFollowup,
    fallbackFollowups(firstFollowup),
  )

  assert.equal(stepTwo.length, 2)
  assert.ok(stepTwo.every(question => /gender|pay|gap|controlled|uncontrolled/i.test(question)))
  assert.ok(stepTwo.every(question => !/medicine|simulation|validation framework/i.test(question)))
})

test('failed-closed pay-gap turn yields relevant continuation questions', () => {
  const repaired = validateSuggestedFollowups([], firstFollowup, repairFollowups(firstFollowup))
  assert.equal(repaired.length, 2)
  assert.ok(repaired.every(question => /gender|pay|gap|controlled|uncontrolled/i.test(question)))
  assert.ok(repaired.every(question => !/required before answering|restated only|empirical research/i.test(question)))
})

test('original pay-gap prompt produces pay-gap fallback questions', () => {
  const fallback = fallbackFollowups(original)
  assert.equal(fallback.length, 2)
  assert.ok(fallback.every(question => /pay|gap|women|men/i.test(question)))
})
