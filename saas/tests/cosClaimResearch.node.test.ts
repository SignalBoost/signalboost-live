import assert from 'node:assert/strict'
import test from 'node:test'
import { splitResearchClaims } from '../lib/ai/cos/cosClaimResearch.ts'

test('claim research splits a compound live goal instead of judging one answer packet', () => {
  assert.deepEqual(
    splitResearchClaims('Who leads Example Agency today and what did it publish last year?'),
    ['Who leads Example Agency today', 'what did it publish last year'],
  )
})

test('claim research keeps a single question as one claim', () => {
  assert.deepEqual(splitResearchClaims('What is the current exchange rate?'), ['What is the current exchange rate'])
})
