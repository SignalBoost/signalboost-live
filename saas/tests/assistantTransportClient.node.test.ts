import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('recovers a persisted assistant reply without retrying POST', async () => {
  let posts = 0
  const sentAt = Date.now()
  const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new TypeError('Failed to fetch')
    }
    return new Response(JSON.stringify({ messages: [
      { role: 'user', content: 'power spike question', created_at: new Date(sentAt).toISOString() },
      { role: 'assistant', content: 'Recovered grounded answer' },
    ] }), { status: 200 })
  }

  const result = await sendAssistantTurnAndRecover(
    'power spike question',
    { messages: [{ role: 'user', content: 'power spike question' }] },
    {
      sendUrl: '/api/cos-primary',
      historyUrl: '/api/assistant/chats?id=test',
      fetchImpl: fetchImpl as typeof fetch,
      historyPollAttempts: 2,
      historyPollDelayMs: 250,
      sleep: async () => undefined,
    },
  )

  assert.equal(posts, 1)
  assert.equal(result.ok, true)
  assert.equal(result.source, 'recovered')
  if (result.ok) assert.equal(result.content, 'Recovered grounded answer')
})

test('shows human timeout copy when History has no reply yet', async () => {
  let posts = 0
  const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      posts += 1
      throw new TypeError('Failed to fetch')
    }
    return new Response(JSON.stringify({ messages: [] }), { status: 200 })
  }

  const result = await sendAssistantTurnAndRecover(
    'power spike question',
    { messages: [{ role: 'user', content: 'power spike question' }] },
    {
      sendUrl: '/api/cos-primary',
      historyUrl: '/api/assistant/chats?id=test',
      fetchImpl: fetchImpl as typeof fetch,
      historyPollAttempts: 1,
      historyPollDelayMs: 250,
      sleep: async () => undefined,
    },
  )

  assert.equal(posts, 1)
  assert.equal(result.ok, false)
  assert.equal(result.source, 'transport')
  assert.equal(result.retrySafe, false)
  assert.match(result.content, /Check History before retrying/)
  assert.doesNotMatch(result.content, /Failed to fetch/i)
})

test('deliberate user Stop remains an AbortError and never polls History', async () => {
  let gets = 0
  const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      const error = new DOMException('The operation was aborted', 'AbortError')
      throw error
    }
    gets += 1
    return new Response(JSON.stringify({ messages: [] }), { status: 200 })
  }

  await assert.rejects(
    () => sendAssistantTurnAndRecover(
      'stop this',
      { messages: [{ role: 'user', content: 'stop this' }] },
      {
        sendUrl: '/api/cos-primary',
        historyUrl: '/api/assistant/chats?id=test',
        fetchImpl: fetchImpl as typeof fetch,
        shouldRecoverTransportFailure: () => false,
      },
    ),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  )
  assert.equal(gets, 0)
})

test('gateway HTML is never exposed as an assistant answer', async () => {
  const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (String(init?.method || 'GET').toUpperCase() === 'POST') {
      return new Response('<html>gateway timeout</html>', { status: 504, headers: { 'content-type': 'text/html' } })
    }
    return new Response(JSON.stringify({ messages: [] }), { status: 200 })
  }

  const result = await sendAssistantTurnAndRecover(
    'power spike question',
    { messages: [{ role: 'user', content: 'power spike question' }] },
    {
      sendUrl: '/api/cos-primary',
      historyUrl: '/api/assistant/chats?id=test',
      fetchImpl: fetchImpl as typeof fetch,
      historyPollAttempts: 1,
      historyPollDelayMs: 250,
      sleep: async () => undefined,
    },
  )

  assert.equal(result.ok, false)
  assert.match(result.content, /Check History before retrying/)
  assert.doesNotMatch(result.content, /<html>/i)
})

test('owner Assistant mounts the recovery boundary only on dashboard/assistant and never auto-recovers AbortError', () => {
  const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../app/dashboard/assistant/layout.tsx', import.meta.url), 'utf8')

  assert.match(layout, /AssistantTransportBoundary/)
  assert.match(boundary, /pathname === '\/api\/cos-primary'/)
  assert.match(boundary, /sendAssistantTurnAndRecover/)
  assert.match(boundary, /fetchImpl: originalFetch/)
  assert.match(boundary, /historyUrl: `\/api\/assistant\/chats\?id=/)
  assert.match(boundary, /shouldRecoverTransportFailure: error => !\(error instanceof DOMException && error\.name === 'AbortError'\)/)
  assert.doesNotMatch(boundary, /window\.fetch\([^)]*\/api\/cos-primary/)
})
