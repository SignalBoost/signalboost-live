import assert from 'node:assert/strict'
import test from 'node:test'
import { compressPromptContext } from '../lib/cos-core/layers/optimization/index.ts'
import { MemoryLayer } from '../lib/cos-core/layers/memory/index.ts'
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

test('memory layer compacts long context locally without a provider', async () => {
  const memory = new MemoryLayer()
  const messages = [
    { role: 'user' as const, content: 'My goal is to make COS independent from routine provider calls.' },
    { role: 'assistant' as const, content: 'COS will prefer local reasoning and stored knowledge.' },
    { role: 'user' as const, content: 'The daily learning process must use approved sources.' },
    { role: 'assistant' as const, content: 'The learning cycle uses a zero-LLM policy.' },
    { role: 'user' as const, content: 'COS should remember successful strategies.' },
    { role: 'assistant' as const, content: 'Verified outcomes are persisted for reuse.' },
    { role: 'user' as const, content: 'What should COS do next?' },
    { role: 'assistant' as const, content: 'Use the stored context before escalating.' },
  ]

  const result = await memory.processMemoryLayer('local-memory-test', messages)
  assert.equal(result.length, 3)
  assert.equal(result[0].role, 'system')
  assert.match(result[0].content, /COS OPERATING SYSTEM CONTEXT SYSTEM SNAPSHOT/)
  assert.match(result[0].content, /independent from routine provider calls/i)
  assert.equal(result[1].content, 'What should COS do next?')
  assert.equal(result[2].content, 'Use the stored context before escalating.')
})
