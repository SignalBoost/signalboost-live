import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getExternalInfo,
  isCurrentPublicOfficeQuery,
  isGeneralNewsMediaResult,
  setWebSearchPort,
} from '../lib/ai/tools/getExternalInfo.ts'

test('explicit live current-fact search executes again on every request', async () => {
  let calls = 0
  setWebSearchPort({
    async search(query, count) {
      calls += 1
      return [{
        title: `Live result ${calls}`,
        url: `https://source${calls}.example.gov/current`,
        snippet: `${query} ${count}`,
      }]
    },
  })

  const query = 'Who is the current office holder? authoritative current as of 2026-08-15'
  const first = await getExternalInfo(query, 8, { bypassCache: true })
  const second = await getExternalInfo(query, 8, { bypassCache: true })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(calls, 2, 'live volatile-fact lookup must not replay a prior search response')
  assert.notEqual(first.results[0]?.url, second.results[0]?.url)
})

test('freshness-policy query bypasses transport cache even if caller omits the option', async () => {
  let calls = 0
  setWebSearchPort({
    async search() {
      calls += 1
      return [{
        title: `Freshness result ${calls}`,
        url: `https://fresh${calls}.example.gov/current`,
        snippet: 'current verified source',
      }]
    },
  })

  const query = 'who is current president latest official authoritative independent verification as of 2026-08-15'
  await getExternalInfo(query, 8)
  await getExternalInfo(query, 8)
  assert.equal(calls, 2)
})

test('ordinary non-volatile search can still use the short transport cache', async () => {
  let calls = 0
  setWebSearchPort({
    async search() {
      calls += 1
      return [{ title: 'Stable result', url: 'https://example.com/stable', snippet: 'stable' }]
    },
  })

  const query = `ordinary-cache-test-${Date.now()}`
  await getExternalInfo(query, 4)
  await getExternalInfo(query, 4)
  assert.equal(calls, 1)
})

test('current public-office queries exclude general news media from usable evidence', async () => {
  setWebSearchPort({
    async search() {
      return [
        { title: 'President profile - breaking news and analysis', url: 'https://www.cnn.com/politics/president', snippet: 'media result' },
        { title: 'Latest politics', url: 'https://www.foxnews.com/politics/president', snippet: 'media result' },
        { title: 'President latest news', url: 'https://www.msnbc.com/politics/president', snippet: 'media result' },
        { title: 'US President', url: 'https://www.bbc.com/news/us-president', snippet: 'media result' },
        { title: 'Presidents, vice presidents, and first ladies', url: 'https://www.usa.gov/presidents', snippet: 'Official U.S. government information.' },
        { title: 'Who is President of United States of America', url: 'https://factually.co/fact-checks/politics/who-is-president-of-united-states-2026-983c07', snippet: 'Independent reference result.' },
      ]
    },
  })

  const query = 'Who is currently the president of the United States? current latest official authoritative independent verification as of 2026-08-16'
  const result = await getExternalInfo(query, 6, { bypassCache: true })

  assert.equal(isCurrentPublicOfficeQuery(query), true)
  assert.equal(result.ok, true)
  assert.deepEqual(result.results.map(source => source.url), [
    'https://www.usa.gov/presidents',
    'https://factually.co/fact-checks/politics/who-is-president-of-united-states-2026-983c07',
  ])
  assert.equal(result.results.some(source => /cnn|foxnews|msnbc|bbc/i.test(source.url)), false)
})

test('general-news outlets remain available for actual news queries', async () => {
  setWebSearchPort({
    async search() {
      return [
        { title: 'Breaking news update', url: 'https://www.bbc.com/news/world-example', snippet: 'news event' },
        { title: 'Latest report', url: 'https://www.cnn.com/world/example', snippet: 'news event' },
      ]
    },
  })

  const query = 'What is the latest breaking news on the example event?'
  const result = await getExternalInfo(query, 4, { bypassCache: true })
  assert.equal(isCurrentPublicOfficeQuery(query), false)
  assert.equal(result.ok, true)
  assert.equal(result.results.length, 2)
})

test('known general-news source classifier recognizes major media hosts without ideological distinction', () => {
  const cases = [
    'https://cnn.com/example',
    'https://www.foxnews.com/example',
    'https://www.msnbc.com/example',
    'https://www.bbc.co.uk/news/example',
    'https://www.reuters.com/world/example',
    'https://apnews.com/article/example',
  ]
  for (const url of cases) {
    assert.equal(isGeneralNewsMediaResult({ title: 'Report', url }), true, url)
  }
  assert.equal(isGeneralNewsMediaResult({ title: 'Official government page', url: 'https://www.usa.gov/presidents' }), false)
})
