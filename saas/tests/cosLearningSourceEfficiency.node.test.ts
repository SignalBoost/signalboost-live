import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContinuousLearningSourceAdapter } from '../lib/cos-core/layers/learning/cycle'
import type { KnowledgeGap } from '../lib/cos-core/layers/learning/index'
import { youtubeLearningConnector } from '../lib/cos-core/layers/learning/connectors'
import { createFeedSearch } from '../lib/cos-core/layers/learning/feedClients'
import { createLiveLearningAdapters, guardLearningSourceAdapter } from '../lib/cos-core/layers/learning/liveSources'
import { createGdeltNewsSearch, createYouTubeTranscriptSearch, LearningSourceFetchError } from '../lib/cos-core/layers/learning/mediaClients'

const GAP: KnowledgeGap = {
  id: 'curriculum:multi-tenant-saas-performance',
  subject: 'Multi-tenant SaaS performance isolation',
  question: 'What concrete mechanisms cause tenant-specific API p95 latency?',
  portableIds: ['cos'],
  expectedReuse: 20,
  expectedAvoidedCostUsd: 1,
  urgency: 95,
  evidence: ['test'],
}

function youtubeSearchResponse() {
  return new Response(JSON.stringify({
    items: [{
      id: { videoId: 'abc123XYZ' },
      snippet: {
        title: 'PostgreSQL tail latency',
        description: 'Connection pools and wait events in multi tenant SaaS.',
        channelTitle: 'SignalBoost Test',
        publishedAt: '2026-08-12T00:00:00Z',
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('transcript search uses one YouTube discovery and returns the full transcript when available', async () => {
  const calls: string[] = []
  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('youtube/v3/search')) return youtubeSearchResponse()
    return new Response(JSON.stringify({
      transcript: 'PostgreSQL pg_stat_activity wait events and connection pool pressure distinguish database execution time from application queueing. '.repeat(4),
      license: 'authorized transcript supplied to COS',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const search = createYouTubeTranscriptSearch('test-key', {
    transcriptApiUrl: 'https://pod-11434.proxy.runpod.net/transcript',
    transcriptApiToken: 'test-token',
    metadataFallback: true,
  }, fetcher)
  const results = await search('postgresql tenant latency', 2)

  assert.equal(calls.filter(url => url.includes('youtube/v3/search')).length, 1)
  assert.equal(calls.length, 2, 'one discovery plus one transcript lookup')
  assert.equal(results.length, 1)
  assert.ok(results[0].text.includes('pg_stat_activity'))
  assert.ok(!String(results[0].license).toLowerCase().includes('metadata'))
})

test('repeated subject discovery is cached within one learning run', async () => {
  const calls: string[] = []
  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('youtube/v3/search')) return youtubeSearchResponse()
    return new Response(JSON.stringify({ transcript: 'Substantive transcript evidence about tenant latency and connection pools. '.repeat(8) }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const search = createYouTubeTranscriptSearch('test-key', { transcriptApiUrl: 'https://pod-11434.proxy.runpod.net/transcript', metadataFallback: true }, fetcher)

  await search('Multi-tenant SaaS performance isolation', 2)
  await search('Multi-tenant SaaS performance isolation', 2)

  assert.equal(calls.filter(url => url.includes('youtube/v3/search')).length, 1, 'same subject should spend one search.list call')
  assert.equal(calls.filter(url => url.includes('/transcript')).length, 2, 'transcript lookup may be retried for each question while discovery is shared')
})

test('YouTube learning connector searches by subject while relevance remains question-specific downstream', async () => {
  const queries: string[] = []
  const connector = youtubeLearningConnector(async (query) => { queries.push(query); return [] }, 2, 'youtube-test')
  await connector.acquire(GAP)
  await connector.acquire({ ...GAP, id: 'curriculum:multi-tenant-saas-performance-2', question: 'How do cache evictions affect enterprise tenants?' })
  assert.deepEqual(queries, [GAP.subject, GAP.subject])
})

test('transcript failure reuses the same discovery result as metadata instead of issuing another YouTube search', async () => {
  const calls: string[] = []
  const fetcher = (async (input: any) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('youtube/v3/search')) return youtubeSearchResponse()
    return new Response('unavailable', { status: 503 })
  }) as typeof fetch

  const search = createYouTubeTranscriptSearch('test-key', {
    transcriptApiUrl: 'https://pod-11434.proxy.runpod.net/transcript',
    metadataFallback: true,
  }, fetcher)
  const results = await search('postgresql tenant latency', 2)

  assert.equal(calls.filter(url => url.includes('youtube/v3/search')).length, 1)
  assert.equal(calls.length, 2)
  assert.equal(results.length, 1)
  assert.match(String(results[0].license), /metadata/i)
  assert.ok(results[0].text.includes('Connection pools'))
})

test('configured transcript runtime replaces the redundant YouTube metadata adapter', () => {
  const adapters = createLiveLearningAdapters({
    COS_LIVE_SOURCES_ENABLED: 'true',
    YOUTUBE_API_KEY: 'test-key',
    LOCAL_AI_BASE_URL: 'https://examplepod-11434.proxy.runpod.net/v1',
    LOCAL_AI_API_KEY: 'shared-secret',
  })
  const youtubeIds = adapters.map(adapter => adapter.id ?? '').filter(id => id.startsWith('youtube_'))

  assert.deepEqual(youtubeIds, ['youtube_transcript_runpod'])
})

test('built-in first-party news feeds remain available when GDELT is unavailable', () => {
  const ids = createLiveLearningAdapters({ COS_LIVE_SOURCES_ENABLED: 'true' }).map(adapter => adapter.id)
  assert.ok(ids.includes('gdelt'))
  assert.ok(ids.includes('builtin_tech_news'))
})

test('source guard serializes a provider burst and queued calls stop after the circuit opens', async () => {
  let active = 0
  let maxActive = 0
  let underlyingCalls = 0
  const base: ContinuousLearningSourceAdapter = {
    kind: 'news_article',
    id: 'burst-test',
    async acquire() {
      underlyingCalls += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      throw new Error('rate limited')
    },
  }
  const guarded = guardLearningSourceAdapter(base, 2, 0, 30_000)

  const settled = await Promise.allSettled(Array.from({ length: 6 }, () => guarded.acquire(GAP)))

  assert.equal(maxActive, 1, 'same-provider calls must never overlap')
  assert.equal(underlyingCalls, 2, 'queued calls must not hit the provider after the failure limit opens the circuit')
  assert.equal(settled.filter(result => result.status === 'rejected').length, 2)
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 4)
})

test('one HTTP 429 opens the source circuit immediately instead of waiting for the normal failure limit', async () => {
  let underlyingCalls = 0
  const base: ContinuousLearningSourceAdapter = {
    kind: 'news_article',
    id: 'gdelt-test',
    async acquire() {
      underlyingCalls += 1
      throw new LearningSourceFetchError('COS learning source failed: 429', 429, true, 60_000)
    },
  }
  const guarded = guardLearningSourceAdapter(base, 3, 0, 30_000)
  const settled = await Promise.allSettled(Array.from({ length: 5 }, () => guarded.acquire(GAP)))

  assert.equal(underlyingCalls, 1)
  assert.equal(settled.filter(result => result.status === 'rejected').length, 1)
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 4)
})

test('identical GDELT throttling failure is cooled and reused instead of refetched immediately', async () => {
  let calls = 0
  const fetcher = (async () => {
    calls += 1
    return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } })
  }) as typeof fetch
  const search = createGdeltNewsSearch(fetcher)

  await assert.rejects(() => search('regional kubernetes outage', 2), /429/)
  await assert.rejects(() => search('regional kubernetes outage', 2), /429/)

  assert.equal(calls, 2, 'first lookup may use two bounded attempts; identical retry must reuse the cached failure')
})

test('successful identical GDELT query is cached within the learning run', async () => {
  let calls = 0
  const fetcher = (async () => {
    calls += 1
    return new Response(JSON.stringify({
      articles: [{
        url: 'https://example.com/kubernetes-latency',
        title: 'Kubernetes regional latency incident',
        domain: 'example.com',
        language: 'English',
        seendate: '20260815T120000Z',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const search = createGdeltNewsSearch(fetcher)

  const first = await search('kubernetes regional latency', 2)
  const second = await search('kubernetes regional latency', 2)

  assert.equal(calls, 1)
  assert.equal(first.length, 1)
  assert.deepEqual(second, first)
})

test('feed search fetches each publication once and reuses it across learning questions', async () => {
  let calls = 0
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Kubernetes latency update</title><link>https://example.com/update</link><description>Regional Kubernetes networking latency and DNS behavior.</description><pubDate>Sat, 15 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`
  const fetcher = (async () => {
    calls += 1
    return new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' } })
  }) as typeof fetch
  const search = createFeedSearch([{ url: 'https://example.com/feed.xml', label: 'Example' }], fetcher)

  const first = await search('kubernetes latency', 3)
  const second = await search('kubernetes networking', 3)

  assert.equal(calls, 1)
  assert.equal(first.length, 1)
  assert.equal(second.length, 1)
})
