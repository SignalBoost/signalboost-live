import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAssistantTransportFailure,
  sendAssistantTurnAndRecover,
} from '../lib/ai/cos/assistantTransportClient.ts'

test('classifies browser fetch failures as transport losses', () => {
  assert.equal(isAssistantTransportFailure(new TypeError('Failed to fetch')), true)
  assert.equal(isAssistantTransportFailure(new Error('The operation was aborted')), true)
  assert.equal(isAssistantTransportFailure(new Error('validation failed')), false)
})

test('recovers a persisted assistant reply instead of retrying POST', async () => {
  let posts = 0
  const sentAt = Date.now()
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new TypeError('Failed to fetch')
    }
    return new Response(JSON.stringify([
      { role: 'user', content: 'power spike question', created_at: new Date(sentAt).toISOString() },
      { role: 'assistant', content: 'Recovered grounded answer' },
    ]), { status: 200 })
  }

  const result = await sendAssistantTurnAndRecover(
    'power spike question',
    { content: 'power spike question' },
    {
      sendUrl: '/api/cos/assistant',
      historyUrl: '/api/cos/assistant/history',
      fetchImpl: fetchImpl as typeof fetch,
      historyPollAttempts: 2,
      historyPollDelayMs: 1,
      sleep: async () => undefined,
    },
  )

  assert.equal(posts, 1)
  assert.equal(result.ok, true)
  assert.equal(result.source, 'recovered')
  if (result.ok) assert.equal(result.content, 'Recovered grounded answer')
})

test('shows timeout copy when history has no reply yet', async () => {
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      throw new TypeError('Failed to fetch')
    }
    return new Response(JSON.stringify([]), { status: 200 })
  }

  const result = await sendAssistantTurnAndRecover(
    'power spike question',
    { content: 'power spike question' },
    {
      sendUrl: '/api/cos/assistant',
      historyUrl: '/api/cos/assistant/history',
      fetchImpl: fetchImpl as typeof fetch,
      historyPollAttempts: 1,
      historyPollDelayMs: 1,
      sleep: async () => undefined,
    },
  )

  assert.equal(result.ok, false)
  assert.equal(result.source, 'transport')
  assert.equal(result.retrySafe, false)
  assert.match(result.content, /Check History before retrying/)
})
