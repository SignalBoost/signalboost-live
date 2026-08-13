import assert from 'node:assert/strict'
import test from 'node:test'
import { cosineSimilarity, lexicalOverlapScore, rankByVectors, relevanceTerms } from '../lib/ai/cos/contextRelevance'

test('cosine similarity ranks directionally similar evidence above unrelated evidence', () => {
  const candidates = [
    { item: 'plan', text: 'query plan regression for large tenants' },
    { item: 'travel', text: 'airline hotel itinerary' },
  ]
  const ranked = rankByVectors(candidates, [1, 0], [[0.95, 0.05], [0, 1]], 0.5)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0]?.item, 'plan')
  assert.ok((ranked[0]?.similarity ?? 0) > 0.9)
})

test('cosine similarity rejects mismatched dimensions and zero vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1]), -1)
  assert.equal(cosineSimilarity([0, 0], [0, 0]), -1)
})

test('lexical fallback requires meaningful overlap rather than a single broad word', () => {
  const query = 'enterprise tenant API latency database health'
  const weak = 'enterprise sales outreach campaign'
  const strong = 'enterprise tenant API latency regression and database wait analysis'
  assert.ok(lexicalOverlapScore(query, strong) > lexicalOverlapScore(query, weak))
})

test('relevance terms preserve unicode words and drop generic glue words', () => {
  const terms = relevanceTerms('Dlaczego opóźnienie API dotyczy tylko dużych tenantów while traffic is unchanged?')
  assert.ok(terms.includes('opóźnienie'))
  assert.ok(!terms.includes('while'))
})
