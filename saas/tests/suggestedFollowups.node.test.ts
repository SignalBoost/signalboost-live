import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fallbackFollowups, repairFollowups, validateSuggestedFollowups } from '../lib/ai/cos/suggestedFollowupPolicy.ts'

test('suggested followups are exactly two complete, non-repeated questions', () => {
  assert.deepEqual(
    validateSuggestedFollowups([
      'What factors are associated with the difference between uncontrolled and controlled U.S. gender pay-gap estimates?',
      'How do occupation and hours worked affect U.S. gender pay-gap estimates?',
    ], 'Is there a pay gap between women and men in the U.S.?', []),
    [
      'What factors are associated with the difference between uncontrolled and controlled U.S. gender pay-gap estimates?',
      'How do occupation and hours worked affect U.S. gender pay-gap estimates?',
    ],
  )
})

test('one invalid candidate suppresses the whole followup surface instead of padding it', () => {
  assert.deepEqual(
    validateSuggestedFollowups(['not a question', 'How do occupation and hours worked affect U.S. gender pay-gap estimates?'], 'Is there a pay gap between women and men in the U.S.?', []),
    [],
  )
})

test('generic and failed-closed fallback questions are deliberately disabled', () => {
  assert.deepEqual(fallbackFollowups('Explain the Bay of Pigs invasion.'), [])
  assert.deepEqual(repairFollowups('Is there a pay gap between women and men in the U.S.?'), [])
})

test('followup generator requires standalone grounded questions and can decline the surface', () => {
  const source = readFileSync(new URL('../lib/ai/cos/suggestedFollowups.ts', import.meta.url), 'utf8')
  assert.match(source, /standalone next questions/)
  assert.match(source, /answerable by continuing research/)
  assert.match(source, /return \{\"followups\":\[\]\}/)
  assert.match(source, /snippet/)
  assert.match(source, /args\.failedClosed\) return \[\]/)
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
