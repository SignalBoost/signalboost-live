import assert from 'node:assert/strict'
import test from 'node:test'
import { getExternalInfo, setWebSearchPort } from '../lib/ai/tools/getExternalInfo.ts'

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
