import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fallbackFollowups, repairFollowups, validateSuggestedFollowups } from '../lib/ai/cos/suggestedFollowupPolicy.ts'

test('suggested followups are exactly two complete, non-repeated, on-topic questions', () => {
  assert.deepEqual(
    validateSuggestedFollowups(
      ['What happened after the Bay of Pigs invasion?', 'How did the Bay of Pigs invasion affect Cuba?'],
      'Explain the Bay of Pigs invasion.',
      ['What happened next after the Bay of Pigs invasion?', 'Who was involved in the Bay of Pigs invasion?'],
    ),
    ['What happened after the Bay of Pigs invasion?', 'How did the Bay of Pigs invasion affect Cuba?'],
  )
})

test('off-topic model output is rejected instead of starting a retrieval cascade', () => {
  const prompt = 'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?'
  const result = validateSuggestedFollowups(
    [
      'What does empirical research mean in medicine?',
      'Which validation framework is used for agent-based simulations?',
    ],
    prompt,
    fallbackFollowups(prompt),
  )
  assert.equal(result.length, 2)
  assert.ok(result.every(item => /(?:uncontrolled|controlled|gender|pay|gap)/i.test(item)))
  assert.ok(result.every(item => !/medicine|simulation/i.test(item)))
})

test('failed-closed followups stay about the failed question instead of verification mechanics', () => {
  const prompt = 'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?'
  const result = validateSuggestedFollowups([], prompt, repairFollowups(prompt))
  assert.equal(result.length, 2)
  assert.ok(result.every(item => /(?:uncontrolled|controlled|gender|pay|gap)/i.test(item)))
  assert.ok(result.every(item => !/required before answering|restated only/i.test(item)))
})

test('invalid local output falls back to two safe full questions', () => {
  const prompt = 'Explain the Bay of Pigs invasion.'
  const result = validateSuggestedFollowups(['not a question', prompt], prompt, fallbackFollowups(prompt))
  assert.equal(result.length, 2)
  assert.ok(result.every(item => item.endsWith('?')))
})

test('the Concierge renders suggestions separately and sends a chip through the normal ask loop', () => {
  const source = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  assert.match(source, /suggestedFollowups/)
  assert.match(source, /onClick=\{\(\) => ask\(followup\)\}/)
  assert.match(source, /homepage\.concierge\.continue/)
})

test('the public homepage chat renders followup chips from the API response', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /payload\?\.suggested_followups/)
  assert.match(source, /ask\(followup\)/)
})

test('COS primary decorates successful replies and the public boundary persists its chips with the turn', () => {
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(primary, /suggested_followups = await suggestFollowups/)
  assert.match(browser, /attachSuggestedFollowupsToStoredTurn/)
})
