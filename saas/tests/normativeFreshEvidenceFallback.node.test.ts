import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNormativeFreshEvidenceFallback } from '../lib/ai/cos/normativeFreshEvidenceFallback.ts'

const sources = [
  {
    id: 'LIVE1',
    title: "Keeping Men Out of Women's Sports – The White House",
    url: 'https://example.gov/policy',
    snippet: 'Menu Search Scroll Left News Gallery Livestream Election Integrity Contact',
  },
  {
    id: 'LIVE2',
    title: 'Official eligibility policy',
    url: 'https://example.org/policy',
    snippet: 'The governing body states its current eligibility rule.',
  },
]

test('normative synthesis failure never promotes raw search snippets to an answer', () => {
  assert.equal(buildNormativeFreshEvidenceFallback({
    input: 'should men play in women sports?',
    sources,
    language: 'en',
  }), null)
})

test('fallback remains unavailable for non-normative questions and empty evidence', () => {
  assert.equal(buildNormativeFreshEvidenceFallback({ input: 'What is a database?', sources, language: 'en' }), null)
  assert.equal(buildNormativeFreshEvidenceFallback({ input: 'Should voting be allowed?', sources: [], language: 'en' }), null)
})
