import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { validateSuggestedFollowups } from '../lib/ai/cos/suggestedFollowupPolicy.ts'

test('suggested followups are exactly two complete, non-repeated questions', () => {
  assert.deepEqual(
    validateSuggestedFollowups(['What happened after the Bay of Pigs invasion?', 'How did it lead to the Cuban Missile Crisis?'], 'Explain the Bay of Pigs invasion.', ['What happened next after Bay of Pigs?', 'Who were the main people involved in Bay of Pigs?']),
    ['What happened after the Bay of Pigs invasion?', 'How did it lead to the Cuban Missile Crisis?'],
  )
})

test('invalid local output falls back to two safe full questions', () => {
  const result = validateSuggestedFollowups(['not a question', 'Explain the Bay of Pigs invasion.'], 'Explain the Bay of Pigs invasion.', ['What happened next after Bay of Pigs?', 'Who were the main people involved in Bay of Pigs?'])
  assert.equal(result.length, 2)
  assert.ok(result.every(item => item.endsWith('?')))
})

test('the Concierge renders suggestions separately and sends a chip through the normal ask loop', () => {
  const source = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  assert.match(source, /suggestedFollowups/)
  assert.match(source, /onClick=\{\(\) => ask\(followup\)\}/)
  assert.match(source, /assistantFeedback\.continueFollowups/)
})
