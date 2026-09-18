import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDurableCosTurnReply, findRecoveredAssistantReply } from '../lib/ai/cos/assistantTransportRecovery.ts'

test('ordinary owner COS returns a durable 202 before background inference and never replays POST', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  assert.match(route, /enqueueDurableCosTurn/)
  assert.match(route, /after\(async \(\) =>/)
  assert.match(route, /finishDurableCosTurn/)
  assert.match(route, /turnId,/)
  assert.match(route, /status: 'running'/)
  assert.match(route, /\{ status: 202 \}/)
  assert.match(route, /const workerResponse = await cosBrowserPost/)
})

test('browser follows durable COS History by turn id with read-only GETs', () => {
  const client = readFileSync(join(process.cwd(), 'lib/ai/cos/agentProgressClient.ts'), 'utf8')
  assert.match(client, /findDurableCosTurnReply/)
  assert.match(client, /COS_TURN_POLL_ATTEMPTS = 180/)
  assert.match(client, /\/api\/assistant\/chats\?id=/)
  assert.match(client, /method: 'GET'/)
  assert.match(client, /Read-only History polling never replays the accepted POST/)
})

test('running durable placeholder is not mistaken for a completed assistant answer', () => {
  const sentAt = Date.now()
  const running = {
    role: 'assistant',
    content: 'COS accepted this turn.',
    provenance: { schema: 'signalboost-cos-turn-v1', turnId: '11111111-1111-4111-8111-111111111111', status: 'running' },
  }
  const messages = [
    { role: 'user', content: 'hello', created_at: new Date(sentAt).toISOString() },
    running,
  ]
  assert.equal(findRecoveredAssistantReply(messages, 'hello', sentAt), null)
  assert.equal(findDurableCosTurnReply(messages, '11111111-1111-4111-8111-111111111111'), null)
})

test('terminal durable row returns the actual final COS response', () => {
  const turnId = '11111111-1111-4111-8111-111111111111'
  const terminal = findDurableCosTurnReply([
    {
      role: 'assistant',
      content: 'Completed answer',
      provenance: { schema: 'signalboost-cos-turn-v1', turnId, status: 'succeeded' },
    },
  ], turnId)
  assert.deepEqual(terminal, { content: 'Completed answer', status: 'succeeded' })
})

test('History terminalizes abandoned durable COS workers rather than leaving running forever', () => {
  const store = readFileSync(join(process.cwd(), 'lib/ai/cos/durableCosTurn.ts'), 'utf8')
  const history = readFileSync(join(process.cwd(), 'app/api/assistant/chats/route.ts'), 'utf8')
  assert.match(store, /COS_TURN_STALE_AFTER_MS = 6 \* 60 \* 1000/)
  assert.match(store, /error: 'worker_lost'/)
  assert.match(store, /provenance->>status', 'running'/)
  assert.match(history, /expireStaleDurableCosTurns/)
})
