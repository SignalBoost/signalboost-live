import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFallbackItems,
  classifyIntent,
  extractKeywords,
  extractQuery,
  normalizeInput,
  optimizePrompt,
  promptPreprocessor,
  validateItems,
} from '../lib/ai/promptPreprocessor.ts'

test('normalizeInput fixes slang and typos', () => {
  assert.match(normalizeInput('wikipidia musuem restuarants sp'), /wikipedia museum restaurants sao paulo/)
})

test('extractKeywords finds NLP keywords', () => {
  assert.deepEqual(extractKeywords('best museums world').slice(0, 3), ['best', 'museums', 'world'])
})

test('classifyIntent identifies Wikipedia data requests', () => {
  const result = classifyIntent('fetch wikipedia data about museums')
  assert.ok(['wikipedia_query', 'data_fetching'].includes(result.intent))
})

test('extractQuery maps varzea teams sp to a Wikipedia query', () => {
  const result = extractQuery('varzea teams sp')
  assert.equal(result.query, 'São Paulo amateur football teams Wikipedia')
  assert.equal(result.confidenceLabel, 'high')
})

test('extractQuery maps vague museum requests to a list query', () => {
  const result = extractQuery('best museums world')
  assert.equal(result.query, 'List of museums in the world Wikipedia')
  assert.ok(result.confidence >= 0.75)
})

test('extractQuery returns low confidence on extraction failure', () => {
  const result = extractQuery('make something cool')
  assert.equal(result.query, null)
  assert.equal(result.confidenceLabel, 'low')
})

test('validateItems fills schema-required values', () => {
  const result = validateItems([{ name: 'Museum', source_url: 'https://example.com/museum' }, {}], 'museum wiki')
  assert.equal(result.items.length, 2)
  assert.match(result.items[0].description, /museum wiki/)
  assert.ok(result.filledFields.includes('items[1].source_url'))
})

test('buildFallbackItems creates source-url-safe records', () => {
  const items = buildFallbackItems('List of museums in the world Wikipedia', 2)
  assert.equal(items.length, 2)
  assert.ok(items.every((item) => item.name && item.source_url.startsWith('https://')))
})

test('optimizePrompt creates structured AI instructions', () => {
  const prompt = optimizePrompt({
    rawInput: 'best museums world',
    normalizedText: 'best museums world',
    intent: 'wikipedia_query',
    query: 'List of museums in the world Wikipedia',
    keywords: ['best', 'museums', 'world'],
    confidence: 0.88,
    useFallback: false,
  })
  assert.match(prompt, /Task summary/)
  assert.match(prompt, /Database schema alignment/)
  assert.match(prompt, /UI rendering instructions/)
})

test('promptPreprocessor returns transparency and fallback decisions', () => {
  const result = promptPreprocessor('make something cool')
  assert.match(result.transparencyMessage, /I interpreted your request as:/)
  assert.equal(result.shouldUseFallback, true)
})
