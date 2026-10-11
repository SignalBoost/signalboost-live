import test from 'node:test'
import assert from 'node:assert/strict'
import { freshEvidenceSearchQueries, isActivityVenueDiscovery } from '../lib/ai/cos/cosFreshGrounding.ts'

test('venue discovery searches activity events, not just named business categories', () => {
  const queries = freshEvidenceSearchQueries('Are there jazz clubs in Montevideo?', new Date('2026-10-11T12:00:00Z'))
  assert.equal(isActivityVenueDiscovery('Are there jazz clubs in Montevideo?'), true)
  assert.ok(queries.some(query => /social nights events parties/i.test(query)))
  assert.ok(queries.some(query => /bar club event organizer/i.test(query)))
})

test('ordinary information requests do not expand into nightlife searches', () => {
  assert.equal(isActivityVenueDiscovery('Who is the president of Uruguay?'), false)
  assert.equal(isActivityVenueDiscovery('What is the GDP of Uruguay?'), false)
  assert.ok(!freshEvidenceSearchQueries('What is the GDP of Uruguay?').some(query => /social nights events parties/i.test(query)))
})

test('discovery intent generalizes across music, dancing and local activities', () => {
  for (const question of ['Where can I dance tango in Buenos Aires?', 'Are there music bars in Lisbon?', 'Any places for karaoke in Tokyo?']) {
    assert.equal(isActivityVenueDiscovery(question), true, question)
  }
})
