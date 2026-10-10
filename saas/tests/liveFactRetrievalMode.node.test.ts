// saas/tests/liveFactRetrievalMode.node.test.ts
//
// LIVE CURRENT-FACT RETRIEVAL — BEHAVIOURAL REGRESSION (2026-10-10). Owner diagnostic on the Assistant for "who
// will be the next brazilian president?": 1 query, 0 results, harness_verifier_evidence_required. The live search
// ran through the credible-web layer built for durable TRAINING corpus, which pads the query with curriculum words
// and admits only institutional/standards/scholarly hosts (>= 0.82); news and data sites score 0.70 and were
// discarded before any page was read. #4111 fixed this with queryMode 'live_reference' (question as asked, floor
// 0.70, shorter readable-page floor). Its tests assert source text; these run a real search against a stubbed
// fetcher so the mode split cannot silently regress.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebTrainingResearchSearch } from '../lib/cos-core/layers/learning/webTrainingDataLayer.ts'

const QUESTION = 'who will be the next brazilian president?'
const NEWS_URL = 'https://www.reuters.com/world/americas/brazil-election-first-round-2026-10-04/'
const GOV_URL = 'https://www.gov.br/planalto/pt-br/eleicoes-2026'
const LONG_BODY = 'Brazil first round results. '.repeat(60)
const SHORT_BODY = 'Brazil first round: results published by the electoral authority on 4 October 2026. '.repeat(3)

function stubFetcher(record: { queries: string[] }, body = LONG_BODY): typeof fetch {
  return (async (input: any) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('duckduckgo.com/html')) {
      record.queries.push(decodeURIComponent(new URL(url).searchParams.get('q') || ''))
      const html = [NEWS_URL, GOV_URL].map(href => `<a class="result__a" href="${href}">Result</a>`).join('\n')
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url === NEWS_URL || url === GOV_URL) {
      return new Response(`<main><h1>Brazil</h1><p>${body}</p></main>`, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
  }) as typeof fetch
}

test('live reference mode sends the question as asked and admits a reputable news site', async () => {
  const record = { queries: [] as string[] }
  const search = createWebTrainingResearchSearch({ fetcher: stubFetcher(record), queryMode: 'live_reference', minCredibility: 0.7 })
  const rows = await search(QUESTION, 5)
  assert.deepEqual(record.queries, [QUESTION])
  assert.deepEqual(rows.map(row => new URL(row.uri).host).sort(), ['www.gov.br', 'www.reuters.com'])
})

test('training mode is unchanged: padded query, news site discarded, government site kept', async () => {
  const record = { queries: [] as string[] }
  const search = createWebTrainingResearchSearch({ fetcher: stubFetcher(record) })
  const rows = await search(QUESTION, 5)
  assert.equal(record.queries.length, 1)
  assert.match(record.queries[0], /authoritative primary source official documentation university research standard$/)
  assert.deepEqual(rows.map(row => new URL(row.uri).host), ['www.gov.br'])
})

test('a concise news page is readable in live mode and still rejected for training', async () => {
  const live = createWebTrainingResearchSearch({ fetcher: stubFetcher({ queries: [] }, SHORT_BODY), queryMode: 'live_reference', minCredibility: 0.7 })
  assert.equal((await live(QUESTION, 5)).length, 2, 'both short pages pass the 180-char live floor')
  const training = createWebTrainingResearchSearch({ fetcher: stubFetcher({ queries: [] }, SHORT_BODY) })
  assert.equal((await training(QUESTION, 5)).length, 0, 'short pages fail the 700-char training floor')
})

test('an explicit stricter floor still wins in live mode', async () => {
  const strict = createWebTrainingResearchSearch({ fetcher: stubFetcher({ queries: [] }), queryMode: 'live_reference', minCredibility: 0.9 })
  assert.deepEqual((await strict(QUESTION, 5)).map(row => new URL(row.uri).host), ['www.gov.br'])
})
