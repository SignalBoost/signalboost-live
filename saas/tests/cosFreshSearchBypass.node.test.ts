import assert from 'node:assert/strict'
import test from 'node:test'
import { getExternalInfo, isExcludedLiveSource, setWebSearchPort } from '../lib/ai/tools/getExternalInfo.ts'

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

test('excluded live-source hosts are removed before COS can ground or cache them', async () => {
  setWebSearchPort({
    async search() {
      return [
        {
          title: 'President Joe Biden - breaking news, video, headlines and analysis',
          url: 'https://www.cnn.com/politics/joe-biden',
          snippet: 'A profile page that must not enter COS evidence.',
        },
        {
          title: 'Presidents, vice presidents, and first ladies',
          url: 'https://www.usa.gov/presidents',
          snippet: 'Official U.S. government information about the president.',
        },
      ]
    },
  })

  const result = await getExternalInfo(
    'Who is the current president latest official authoritative independent verification as of 2026-08-16',
    6,
    { bypassCache: true },
  )

  assert.equal(result.ok, true)
  assert.equal(isExcludedLiveSource('https://www.cnn.com/politics/joe-biden'), true)
  assert.equal(isExcludedLiveSource('https://edition.cnn.com/world'), true)
  assert.equal(result.results.some(source => source.url.includes('cnn.com')), false)
  assert.deepEqual(result.results.map(source => source.url), ['https://www.usa.gov/presidents'])
})

test('retrieval fails closed when every result violates COS live-source policy', async () => {
  setWebSearchPort({
    async search() {
      return [{
        title: 'Excluded result',
        url: 'https://www.cnn.com/politics/example',
        snippet: 'Excluded.',
      }]
    },
  })

  const result = await getExternalInfo('current status latest official authoritative verification as of 2026-08-16', 4, { bypassCache: true })
  assert.equal(result.ok, false)
  assert.deepEqual(result.results, [])
  assert.match(String(result.error), /source policy/i)
})
