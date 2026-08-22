// saas/tests/cosReferenceClients.node.test.ts
//
// COS told users that George Foreman (died March 2025) and Hulk Hogan (died July 2025) were both
// alive. The cause was ACQUISITION, not prompting: the daily catalogue was Crossref, OpenAlex,
// Europe PMC, Open Library, GDELT, tech doc feeds and YouTube — every one technical or academic.
// Nothing in it could tell COS whether a person is alive, so COS answered from frozen weights.
//
// These tests cover the parsing of the reference source with recorded payloads. NOTE: the live API
// could not be exercised from the build sandbox (egress allowlist), so live behaviour must be
// confirmed after deploy — the parsing contract below is what is verified here.

import assert from 'node:assert/strict'
import test from 'node:test'
import { createWikipediaSearch } from '../lib/cos-core/layers/learning/referenceClients.ts'

/** Shapes match the real MediaWiki action API responses. */
function stubFetch(searchHits: unknown[], pages: Record<string, unknown>) {
  return (async (url: string) => ({
    ok: true,
    json: async () => String(url).includes('list=search')
      ? { query: { search: searchHits } }
      : { query: { pages } },
  })) as unknown as typeof fetch
}

const HOGAN_EXTRACT = 'Terry Gene Bollea (August 11, 1953 – July 24, 2025), better known by his ring name Hulk Hogan, was an American professional wrestler and media personality. Widely regarded as one of the greatest and most recognized wrestlers of all time, Hogan won multiple championships worldwide.'

test('a biography returns the death information the model could not know', () => {
  const search = createWikipediaSearch(stubFetch(
    [{ title: 'Hulk Hogan', pageid: 1 }],
    { '1': { title: 'Hulk Hogan', extract: HOGAN_EXTRACT, fullurl: 'https://en.wikipedia.org/wiki/Hulk_Hogan', touched: '2026-08-01T00:00:00Z' } },
  ))
  return search('Hulk Hogan', 1).then(results => {
    assert.equal(results.length, 1)
    assert.match(results[0].text, /July 24, 2025/)
    assert.equal(results[0].license, 'CC BY-SA 4.0')
  })
})

test('observedAt is the page revision date, not the fetch time', () => {
  // A document dated "whenever we fetched it" would defeat every downstream freshness check.
  const search = createWikipediaSearch(stubFetch(
    [{ title: 'X', pageid: 2 }],
    { '2': { title: 'X', extract: HOGAN_EXTRACT, fullurl: 'https://e.x/X', touched: '2026-07-15T10:00:00Z' } },
  ))
  return search('X', 1).then(results => assert.equal(results[0].observedAt, '2026-07-15T10:00:00Z'))
})

test('stubs and empty extracts are dropped rather than diluting relevance scoring', () => {
  const search = createWikipediaSearch(stubFetch(
    [{ title: 'Stub', pageid: 3 }],
    { '3': { title: 'Stub', extract: 'Too short.', fullurl: 'https://e.x/S', touched: '2026-01-01T00:00:00Z' } },
  ))
  return search('Stub', 1).then(results => assert.equal(results.length, 0))
})

test('an API failure returns nothing instead of throwing into the daily cycle', async () => {
  const failing = (async () => { throw new Error('network down') }) as unknown as typeof fetch
  assert.deepEqual(await createWikipediaSearch(failing)('anything', 2), [])

  const notOk = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
  assert.deepEqual(await createWikipediaSearch(notOk)('anything', 2), [])
})

test('an empty query never hits the network', async () => {
  let called = false
  const spy = (async () => { called = true; return { ok: true, json: async () => ({}) } }) as unknown as typeof fetch
  assert.deepEqual(await createWikipediaSearch(spy)('   ', 2), [])
  assert.equal(called, false)
})

test('result count is capped to the requested limit', async () => {
  const hits = Array.from({ length: 10 }, (_u, i) => ({ title: `T${i}`, pageid: i }))
  const pages = Object.fromEntries(hits.map(h => [String(h.pageid), { title: h.title, extract: HOGAN_EXTRACT, fullurl: `https://e.x/${h.title}`, touched: '2026-08-01T00:00:00Z' }]))
  const results = await createWikipediaSearch(stubFetch(hits, pages))('many', 3)
  assert.ok(results.length <= 3)
})
