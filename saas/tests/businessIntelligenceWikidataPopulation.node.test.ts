import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WIKIDATA_POPULATION_BATCH_SIZE,
  WIKIDATA_POPULATION_OFFSET_LIMIT,
  nextWikidataPopulationOffset,
  normalizeWikidataPopulationOffset,
} from '../lib/business-intelligence-corpus/wikidata-population.ts'

test('Wikidata population cursor normalizes invalid offsets to zero', () => {
  assert.equal(normalizeWikidataPopulationOffset(undefined), 0)
  assert.equal(normalizeWikidataPopulationOffset(-1), 0)
  assert.equal(normalizeWikidataPopulationOffset('250'), 250)
})

test('Wikidata population cursor advances by the bounded source batch', () => {
  assert.equal(WIKIDATA_POPULATION_BATCH_SIZE, 100)
  assert.equal(nextWikidataPopulationOffset(0, 100), 100)
  assert.equal(nextWikidataPopulationOffset(1200, 100), 1300)
})

test('Wikidata population cursor wraps instead of exceeding supported source offset', () => {
  assert.equal(WIKIDATA_POPULATION_OFFSET_LIMIT, 100_000)
  assert.equal(nextWikidataPopulationOffset(99_900, 100), 0)
  assert.equal(normalizeWikidataPopulationOffset(100_000), 99_999)
})
