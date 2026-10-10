// saas/tests/liveFactRetrievalMode.node.test.ts
//
// LIVE CURRENT-FACT RETRIEVAL (2026-10-10). Owner diagnostic on the Assistant for "who will be the next brazilian
// president?": "1 query · 0 succeeded · 0 results · 0 kept · reason: harness_verifier_evidence_required". The live
// search runs through the credible-web layer built for durable TRAINING corpus: it pads the query with
// "authoritative primary source official documentation university research standard" and admits only
// institutional/standards/scholarly hosts (>= 0.82). News and data sites, where current facts are reported, score
// 0.70 and were discarded before any page was read. Live-fact mode sends the question as asked and admits the
// credible-secondary tier; training mode is unchanged.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createWebTrainingResearchSearch, LIVE_FACT_MIN_CREDIBILITY } from '../lib/cos-core/layers/learning/webTrainingDataLayer.ts'

const QUESTION = 'who will be the next brazilian president?'
const NEWS_URL = 'https://www.reuters.com/world/americas/brazil-election-first-round-2026-10-04/'
const GOV_URL = 'https://www.gov.br/planalto/pt-br/eleicoes-2026'
const BODY = 'Brazil first round results. '.repeat(60)

function stubFetcher(record: { queries: string[] }): typeof fetch {
  return (async (input: any) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('duckduckgo.com/html')) {
      record.queries.push(decodeURIComponent(new URL(url).searchParams.get('q') || ''))
      const html = [NEWS_URL, GOV_URL]
        .map(href => `<a class="result__a" href="${href}">Result</a>`)
        .join('\n')
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url === NEWS_URL || url === GOV_URL) {
      return new Response(`<main><h1>Brazil</h1><p>${BODY}</p></main>`, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
  }) as typeof fetch
}

test('live-fact mode sends the question as asked and admits a reputable news site', async () => {
  const record = { queries: [] as string[] }
  const search = createWebTrainingResearchSearch({ fetcher: stubFetcher(record), retrievalMode: 'live_fact' })
  const rows = await search(QUESTION, 5)
  assert.deepEqual(record.queries, [QUESTION])
  const hosts = rows.map(row => new URL(row.uri).host).sort()
  assert.deepEqual(hosts, ['www.gov.br', 'www.reuters.com'])
  assert.ok(rows.every(row => row.evidence?.includes('web_data_layer=live_fact_research_v1')))
})

test('training mode is unchanged: padded query, news site discarded, government site kept', async () => {
  const record = { queries: [] as string[] }
  const search = createWebTrainingResearchSearch({ fetcher: stubFetcher(record) })
  const rows = await search(QUESTION, 5)
  assert.equal(record.queries.length, 1)
  assert.match(record.queries[0], /authoritative primary source official documentation university research standard$/)
  assert.deepEqual(rows.map(row => new URL(row.uri).host), ['www.gov.br'])
  assert.ok(rows.every(row => row.evidence?.includes('web_data_layer=credible_training_research_v1')))
})

test('the live-fact floor is the credible-secondary tier, and an explicit floor still wins', async () => {
  assert.equal(LIVE_FACT_MIN_CREDIBILITY, 0.7)
  const record = { queries: [] as string[] }
  const strict = createWebTrainingResearchSearch({ fetcher: stubFetcher(record), retrievalMode: 'live_fact', minCredibility: 0.9 })
  const rows = await strict(QUESTION, 5)
  assert.deepEqual(rows.map(row => new URL(row.uri).host), ['www.gov.br'])
})

test('the live current-fact search is the only governed caller, and it asks for live-fact retrieval', () => {
  const external = readFileSync(new URL('../lib/ai/tools/getExternalInfo.ts', import.meta.url), 'utf8')
  assert.match(external, /searchThroughGovernedWebKnowledge\(\{ query, count, retrievalMode: 'live_fact' \}\)/)
  const governed = readFileSync(new URL('../lib/ai/tools/governedWebKnowledgeSearch.ts', import.meta.url), 'utf8')
  assert.match(governed, /createWebKnowledgeResearchPort\(\{ retrievalMode: input\.retrievalMode \?\? 'training_corpus' \}\)/)
  // Durable learning keeps the strict filter: it builds its own search with no retrieval mode.
  const learning = readFileSync(new URL('../lib/cos-core/layers/learning/liveSources.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(learning, /retrievalMode/)
})
