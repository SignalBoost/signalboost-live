import assert from 'node:assert/strict'
import test from 'node:test'
import { bindSourcesToRequestedWindow, splitResearchClaims } from '../lib/ai/cos/cosClaimResearch.ts'

test('claim research splits a compound live goal instead of judging one answer packet', () => {
  assert.deepEqual(
    splitResearchClaims('Who leads Example Agency today and what did it publish last year?'),
    ['Who leads Example Agency today', 'what did it publish last year'],
  )
})

test('claim research keeps a single question as one claim', () => {
  assert.deepEqual(splitResearchClaims('What is the current exchange rate?'), ['What is the current exchange rate'])
})

test('claim research identifies history wording as its own claim', () => {
  assert.deepEqual(splitResearchClaims('Who leads the agency today and list the past leaders for 20 years'), [
    'Who leads the agency today', 'list the past leaders for 20 years',
  ])
})

test('dated archives outside a requested window cannot satisfy that claim', () => {
  const sources = bindSourcesToRequestedWindow('list the past 20 years', [
    { id: 'LIVE1', title: 'Archive', url: 'https://2001-2009.example.gov/former', snippet: 'Person One (2001–2005)\nPerson Two (2005–2009)' },
    { id: 'LIVE2', title: 'Current history', url: 'https://history.example.gov/people', snippet: 'Person Three (2021–2025)\nPerson Four (2025–)' },
  ], new Date('2026-08-29T00:00:00.000Z'))
  assert.deepEqual(sources.map(source => source.id), ['LIVE2'])
})
