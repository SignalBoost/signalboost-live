// saas/tests/cosResumableAssistantTurn.node.test.ts
//
// Production 2026-10-15: the owner pasted a 4,616-character email edit. COS answered and saved the
// reply in History, but the Assistant page lost the HTTP response and could not match the prompt
// to its 4,000-character stored copy, so it showed "The page stopped waiting before it received
// the COS response". These tests pin the two repairs: truncation-aware matching, and a page that
// takes the saved answer from History whenever the response is late or lost — without re-sending.
import assert from 'node:assert/strict'
import test from 'node:test'
import { findRecoveredAssistantReply, HISTORY_STORED_MESSAGE_CHARS } from '../lib/ai/cos/assistantTransportRecovery.ts'
import { postWithAgentProgress } from '../lib/ai/cos/agentProgressClient.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONVERSATION_ID = '7f8d42f1-eb65-474d-8f51-e9165e5fdc3e'
const LONG_PROMPT = `edit - Thank you Sam, should I send you the TA? ${'From: someone\nSent: today\n'.repeat(180)}`.trim()

function storedHistory(sentAtMs: number, reply = 'Thank you, Sam. Should I send you the TA?') {
  return {
    messages: [
      { role: 'user', content: LONG_PROMPT.slice(0, HISTORY_STORED_MESSAGE_CHARS), created_at: new Date(sentAtMs + 2_000).toISOString() },
      { role: 'assistant', content: reply, created_at: new Date(sentAtMs + 2_000).toISOString() },
    ],
  }
}

test('History cap mirrors the server store', () => {
  const store = readFileSync(join(process.cwd(), 'lib/ai/tools/conversationHistory.ts'), 'utf8')
  assert.match(store, new RegExp(`const MAX_STORED_CONTENT = ${HISTORY_STORED_MESSAGE_CHARS}\\b`))
})

test('a prompt longer than the History cap is recovered from its stored prefix', () => {
  assert.ok(LONG_PROMPT.length > HISTORY_STORED_MESSAGE_CHARS)
  const sentAt = Date.now()
  assert.equal(findRecoveredAssistantReply(storedHistory(sentAt).messages, LONG_PROMPT, sentAt), 'Thank you, Sam. Should I send you the TA?')
})

test('a short stored prompt never matches a longer different prompt', () => {
  const sentAt = Date.now()
  const messages = [
    { role: 'user', content: 'edit - Thank you Sam', created_at: new Date(sentAt).toISOString() },
    { role: 'assistant', content: 'Thank you, Sam.', created_at: new Date(sentAt).toISOString() },
  ]
  assert.equal(findRecoveredAssistantReply(messages, 'edit - Thank you Sam, should I send you the TA?', sentAt), null)
  // An older identical turn is not this send's answer.
  const older = storedHistory(sentAt - 120_000).messages
  assert.equal(findRecoveredAssistantReply(older, LONG_PROMPT, sentAt), null)
})

function installBrowser(fetchImpl: (url: string, init: any) => Promise<Response>) {
  const g = globalThis as any
  const previous = { window: g.window, fetch: g.fetch }
  g.window = globalThis
  g.fetch = fetchImpl
  return () => { g.window = previous.window; g.fetch = previous.fetch }
}

const body = () => ({
  messages: [{ role: 'user', content: LONG_PROMPT }],
  context: { language: 'en', currentPage: '/dashboard/assistant', conversationId: CONVERSATION_ID },
})

test('a stalled COS response is replaced by the saved History answer without re-sending', async () => {
  const sentAt = Date.now()
  const calls: string[] = []
  const restore = installBrowser((url, init) => {
    calls.push(`${init?.method || 'GET'} ${url}`)
    if (init?.method === 'POST') {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    }
    return Promise.resolve(new Response(JSON.stringify(storedHistory(sentAt)), { status: 200 }))
  })
  try {
    const result = await postWithAgentProgress({ target: 'cos', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.ok, true)
    assert.equal(result.data.source, 'cos-transport-history-recovery')
    assert.equal(result.data.reply, 'Thank you, Sam. Should I send you the TA?')
    assert.equal(calls.filter(call => call.startsWith('POST')).length, 1)
    assert.ok(calls.some(call => call === `GET /api/assistant/chats?id=${CONVERSATION_ID}`))
  } finally { restore() }
})

test('a dropped COS connection waits for the saved History answer instead of the timeout copy', async () => {
  const sentAt = Date.now()
  let historyReads = 0
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') return Promise.reject(new TypeError('Load failed'))
    historyReads += 1
    // The server is still working on the first read; the answer is saved by the second.
    const payload = historyReads < 2 ? { messages: [] } : storedHistory(sentAt)
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
  })
  try {
    const result = await postWithAgentProgress({ target: 'cos', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.ok, true)
    assert.equal(result.data.reply, 'Thank you, Sam. Should I send you the TA?')
    assert.ok(historyReads >= 2)
  } finally { restore() }
})

test('a normal fast response is used directly and the History watch stops', async () => {
  let historyReads = 0
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: true, reply: 'Edited.' }), { status: 200 }))
    historyReads += 1
    return Promise.resolve(new Response('{"messages":[]}', { status: 200 }))
  })
  try {
    const result = await postWithAgentProgress({ target: 'cos', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.data.reply, 'Edited.')
    await new Promise(resolve => setTimeout(resolve, 6_000))
    assert.equal(historyReads, 0)
  } finally { restore() }
})

test('when History shows the answer first, a live response that lands in the grace window still wins', async () => {
  const sentAt = Date.now()
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') {
      // Arrives ~2 s after the first History read (which happens at ~5 s).
      return new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify({ ok: true, reply: 'Live reply', diagnostics: { lane: 'fast' } }), { status: 200 })), 7_000))
    }
    return Promise.resolve(new Response(JSON.stringify(storedHistory(sentAt, 'Live reply')), { status: 200 }))
  })
  try {
    const result = await postWithAgentProgress({ target: 'cos', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.data.reply, 'Live reply')
    assert.deepEqual(result.data.diagnostics, { lane: 'fast' })
  } finally { restore() }
})

// Production 2026-10-15: on the homepage Concierge (signed in) the owner saw the timeout copy twice
// for a short edit that the server had answered in seconds and saved in History.
test('the homepage Concierge also takes the saved History answer when its response stalls', async () => {
  const sentAt = Date.now()
  let posts = 0
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') {
      posts += 1
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    }
    return Promise.resolve(new Response(JSON.stringify(storedHistory(sentAt)), { status: 200 }))
  })
  try {
    const result = await postWithAgentProgress({ target: 'concierge', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.ok, true)
    assert.equal(result.data.source, 'cos-transport-history-recovery')
    assert.equal(posts, 1)
  } finally { restore() }
})

test('a visitor without History stops watching after the first refused read', async () => {
  let historyReads = 0
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') return new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify({ ok: true, reply: 'Edited.' }), { status: 200 })), 12_000))
    historyReads += 1
    return Promise.resolve(new Response('{"error":"unauthorized"}', { status: 401 }))
  })
  try {
    const result = await postWithAgentProgress({ target: 'concierge', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.data.reply, 'Edited.')
    assert.equal(historyReads, 1)
  } finally { restore() }
})


test('homepage recovers a completed edit from History after an HTTP 504 gateway response', async () => {
  const sentAt = Date.now()
  const calls: string[] = []
  const restore = installBrowser((url, init) => {
    calls.push((init?.method || 'GET') + ' ' + url)
    if (init?.method === 'POST') return Promise.resolve(new Response(
      JSON.stringify({ reply: 'The page stopped waiting before it received the COS response.', source: 'concierge-browser-deadline' }),
      { status: 504 },
    ))
    return Promise.resolve(new Response(JSON.stringify(storedHistory(sentAt, 'Professionally edited answer.')), { status: 200 }))
  })
  try {
    const response = await postWithAgentProgress({ target: 'concierge', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(response.ok, true)
    assert.equal(response.data.source, 'cos-transport-history-recovery')
    assert.equal(response.data.reply, 'Professionally edited answer.')
    assert.equal(calls.filter(call => call.startsWith('POST ')).length, 1)
    assert.equal(calls.filter(call => call.startsWith('GET ')).length, 1)
  } finally { restore() }
})

test('timeout error envelope with HTTP 200 cannot hide the saved answer', async () => {
  const sentAt = Date.now()
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({
      ok: false,
      reply: 'The page stopped waiting before it received the COS response. It could not confirm whether the server completed the request. Check History before retrying an action to avoid duplicates.',
      source: 'assistant-transport-unconfirmed',
    }), { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify(storedHistory(sentAt, 'The saved edit.')), { status: 200 }))
  })
  try {
    const response = await postWithAgentProgress({ target: 'cos', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(response.ok, true)
    assert.equal(response.data.reply, 'The saved edit.')
    assert.equal(response.data.source, 'cos-transport-history-recovery')
  } finally { restore() }
})

test('no unauthorized History means a lost response stays truthful and is never replayed', async () => {
  let posts = 0
  let reads = 0
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') {
      posts += 1
      return Promise.resolve(new Response(JSON.stringify({ error: 'gateway_timeout' }), { status: 504 }))
    }
    reads += 1
    return Promise.resolve(new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }))
  })
  try {
    const response = await postWithAgentProgress({ target: 'concierge', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(response.ok, false)
    assert.equal(response.status, 504)
    assert.equal(posts, 1)
    assert.equal(reads, 1)
  } finally { restore() }
})

test('a successful model response is shown without waiting for History or a second POST', async () => {
  let posts = 0
  let reads = 0
  const restore = installBrowser((_url, init) => {
    if (init?.method === 'POST') {
      posts += 1
      return Promise.resolve(new Response(JSON.stringify({ ok:true, reply:'Finished edit.' }), { status: 200 }))
    }
    reads += 1
    return Promise.resolve(new Response(JSON.stringify({messages:[]}), { status: 200 }))
  })
  try {
    const response = await postWithAgentProgress({ target: 'concierge', body: body(), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(response.ok, true)
    assert.equal(response.data.reply, 'Finished edit.')
    assert.equal(posts, 1)
    assert.equal(reads, 0)
  } finally { restore() }
})
