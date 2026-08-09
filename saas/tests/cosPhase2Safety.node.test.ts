import assert from 'node:assert/strict'
import test from 'node:test'
import { compressPromptContext } from '../lib/cos-core/layers/optimization/index.ts'
import { withContextSummaryCache } from '../lib/cos-core/layers/memory/summary-cache.ts'

test('prompt compression preserves whitespace-sensitive content', () => {
  const code = 'def f():\n\treturn 1\n\n  fixed  width'
  const result = compressPromptContext([
    { role: 'user', content: code },
    { role: 'user', content: code },
  ])

  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, code)
})

test('summary cache fails open and deduplicates concurrent compaction', async () => {
  let compactions = 0
  const compact = withContextSummaryCache(async ({ sessionId }) => {
    compactions += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return { sessionId, summary: 'ok', extractedFacts: [], recentMessages: [] }
  }, {
    get: async () => { throw new Error('cache unavailable') },
    set: async () => { throw new Error('cache unavailable') },
  })

  const input = { sessionId: 's1', oldTurns: [{ role: 'user' as const, content: 'hello' }] }
  const [first, second] = await Promise.all([compact(input), compact(input)])

  assert.equal(first.summary, 'ok')
  assert.equal(second.summary, 'ok')
  assert.equal(compactions, 1)
})
