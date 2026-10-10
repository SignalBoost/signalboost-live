import assert from 'node:assert/strict'
import test from 'node:test'
import { createWebKnowledgeResearchPort } from '../platform-harness/capabilities/web-knowledge.ts'

const url = 'https://www.gov.br/pt-br/noticias/eleicoes/2026'
const snippet = 'A autoridade eleitoral publicou informações sobre o calendário e as candidaturas da eleição presidencial de 2026. Estes dados são públicos e podem ser consultados na página oficial. A publicação explica também as etapas de apuração e proclamação.'

test('live web knowledge retains attributed Brave excerpt if primary page is blocked', async () => {
  const fetcher = (async (input: any) => {
    const requested = String(input?.url ?? input)
    if (requested.startsWith('https://api.search.brave.com/')) {
      return new Response(JSON.stringify({ web: { results: [{ url, title: 'Eleições 2026', age: '2026-10-09', description: snippet }] } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (requested === url) return new Response('Access denied', { status: 403 })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  const results = await createWebKnowledgeResearchPort({ fetcher, braveApiKey: 'test-key', useBrave: true })
    .search({ query: 'Brazil election official 2026', purpose: 'live_reference', maxResults: 3 })
  assert.equal(results.length, 1)
  assert.equal(results[0].uri, url)
  assert.equal(results[0].text, snippet)
  assert.ok(results[0].evidence.includes('evidence_scope=search_provider_snippet_only'))
  assert.ok(results[0].evidence.includes('page_content_verified=false'))
  assert.equal(results[0].trainingAuthorized, false)
  assert.equal(results[0].durableLearningAuthorized, false)
})

test('short or missing excerpts cannot substitute for inaccessible pages', async () => {
  const fetcher = (async (input: any) => {
    const requested = String(input?.url ?? input)
    if (requested.startsWith('https://api.search.brave.com/')) return new Response(JSON.stringify({ web: { results: [{ url, title: 'Eleições 2026', description: 'Brief excerpt' }] } }), { status: 200 })
    if (requested === url) return new Response('Access denied', { status: 403 })
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  const results = await createWebKnowledgeResearchPort({ fetcher, braveApiKey: 'test-key', useBrave: true })
    .search({ query: 'Brazil election 2026', purpose: 'live_reference', maxResults: 3 })
  assert.equal(results.length, 0)
})
