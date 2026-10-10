// saas/tests/webKnowledgeLiveDiscovery.node.test.ts
//
// Production 2026-10-10 (build 199e38f): a live-fact question was refused with
// "1 query · 0 succeeded · 0 results · reason: web_knowledge_no_results". The governed live-answer run
// searched only with the free HTML scrapers and never used the operator's existing Brave key.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createWebKnowledgeResearchPort } from '../platform-harness/index.ts'

const QUESTION = 'quem sera o proximo presidente do Brasil?'
const SOURCE_URL = 'https://eleicoes.example-news.com/2026/presidente'
const SOURCE_PAGE = `<html><body><article><h1>Eleição presidencial 2026</h1><p>${'Resultado oficial e candidatos registrados na eleição presidencial. '.repeat(8)}</p></article></body></html>`

type Calls = { brave: number; scrapers: number; pages: number }

// Simulates the hosting network: the free scrapers answer but carry no results; Brave and the page work.
function hostingNetworkFetcher(calls: Calls): typeof fetch {
  return (async (input: any) => {
    const url = String(input?.url ?? input)
    if (url.startsWith('https://api.search.brave.com/')) {
      calls.brave++
      return new Response(JSON.stringify({ web: { results: [{ url: SOURCE_URL, title: 'Eleição presidencial 2026', age: '2026-10-09' }] } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    if (/duckduckgo\.com|bing\.com/.test(url)) {
      calls.scrapers++
      return new Response('<html><body>no results</body></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url === SOURCE_URL) {
      calls.pages++
      return new Response(SOURCE_PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

test('with the Brave key the governed live answer finds and reads the source, and records the provider', async () => {
  const calls: Calls = { brave: 0, scrapers: 0, pages: 0 }
  const rows = await createWebKnowledgeResearchPort({ fetcher: hostingNetworkFetcher(calls), braveApiKey: 'test-key', useBrave: true })
    .search({ query: QUESTION, purpose: 'agent_research', maxResults: 3 })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.uri, SOURCE_URL)
  assert.ok(rows[0]?.evidence.includes('discovery_provider=brave'))
  assert.ok(rows[0]?.evidence.includes('source_date=2026-10-09'))
  assert.equal(rows[0]?.trainingAuthorized, false)
  assert.equal(rows[0]?.durableLearningAuthorized, false)
  assert.equal(calls.brave, 1)
  assert.equal(calls.scrapers, 0)
  assert.equal(calls.pages, 1)
})

test('when Brave fails the free scrapers are still tried', async () => {
  let scraperCalls = 0
  const fetcher = (async (input: any) => {
    const url = String(input?.url ?? input)
    if (url.startsWith('https://api.search.brave.com/')) return new Response('unauthorized', { status: 401 })
    if (url.startsWith('https://html.duckduckgo.com/')) {
      scraperCalls++
      return new Response(`<a class="result__a" href="${SOURCE_URL}">Eleição presidencial 2026</a>`, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url === SOURCE_URL) return new Response(SOURCE_PAGE, { status: 200, headers: { 'content-type': 'text/html' } })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  const rows = await createWebKnowledgeResearchPort({ fetcher, braveApiKey: 'revoked-key', useBrave: true })
    .search({ query: QUESTION, purpose: 'agent_research', maxResults: 3 })
  assert.equal(rows.length, 1)
  assert.ok(rows[0]?.evidence.includes('discovery_provider=duckduckgo_html'))
  assert.ok(scraperCalls > 0)
})

test('the host bridge supplies the existing BRAVE_SEARCH_API_KEY to the governed live-answer run only', () => {
  const bridge = readFileSync(join(process.cwd(), 'lib/ai/tools/governedWebKnowledgeSearch.ts'), 'utf8')
  const portable = readFileSync(join(process.cwd(), 'platform-harness/capabilities/web-knowledge.ts'), 'utf8')
  assert.match(bridge, /process\.env\.BRAVE_SEARCH_API_KEY/)
  assert.match(bridge, /createWebKnowledgeResearchPort\(braveApiKey \? \{ braveApiKey, useBrave: true \} : \{\}\)/)
  assert.match(bridge, /input\.research \?\? liveAnswerResearchPort\(\)/)
  // The portable capability never reads host environment variables.
  assert.doesNotMatch(portable, /process\.env/)
})
