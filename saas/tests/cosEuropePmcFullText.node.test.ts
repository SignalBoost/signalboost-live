import assert from 'node:assert/strict'
import test from 'node:test'
import { createEuropePmcScientificSearch } from '../lib/cos-core/layers/learning/publicClients'

test('Europe PMC client upgrades open-access metadata to substantive full text', async () => {
  const calls: string[] = []
  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/search?')) {
      return new Response(JSON.stringify({
        resultList: {
          result: [{
            pmcid: 'PMC1234567',
            title: 'Tail latency in multi-tenant services',
            abstractText: 'Short abstract about tail latency.',
            authorString: 'Example A',
            journalTitle: 'Systems Journal',
            pubYear: '2026',
            isOpenAccess: 'Y',
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/PMC1234567/fullTextXML')) {
      return new Response(`<article><body><sec><title>Results</title><p>${'Multi tenant API p95 latency connection pool queue cache eviction query plan '.repeat(30)}</p></sec></body><ref-list><ref>ignored citation</ref></ref-list></article>`, { status: 200, headers: { 'content-type': 'application/xml' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createEuropePmcScientificSearch(fetcher)
  const results = await search('multi tenant SaaS API latency', 2)

  assert.equal(results.length, 1)
  assert.ok(results[0].text.length >= 900)
  assert.ok(results[0].text.includes('connection pool'))
  assert.doesNotMatch(String(results[0].license), /metadata/i)
  assert.ok(calls.some(url => url.includes('resultType=core')))
  assert.ok(calls.some(url => url.includes('/PMC1234567/fullTextXML')))
})

test('Europe PMC client falls back to abstract metadata when full text is unavailable', async () => {
  const fetcher = (async (input: any) => {
    const url = String(input)
    if (url.includes('/search?')) {
      return new Response(JSON.stringify({
        resultList: {
          result: [{
            doi: '10.1000/test',
            title: 'Queueing systems',
            abstractText: 'A'.repeat(350),
            authorString: 'Example B',
            journalTitle: 'Queue Journal',
            pubYear: '2025',
            isOpenAccess: 'N',
          }],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const search = createEuropePmcScientificSearch(fetcher)
  const results = await search('queueing latency', 1)

  assert.equal(results.length, 1)
  assert.match(String(results[0].license), /metadata/i)
  assert.ok(results[0].text.length >= 300)
})
