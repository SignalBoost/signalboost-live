import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDurableCosTurnReply, findRecoveredAssistantReply } from '../lib/ai/cos/assistantTransportRecovery.ts'
import { requestsExternalAction } from '../lib/ai/cos/cosOrchestration.ts'

test('read-only COS questions stay synchronous while non-replayable actions keep durable 202', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  assert.match(route, /requestsExternalAction/)
  assert.match(route, /const durableConversationTurn = ordinaryConversationTurn && externalActionRequested/)
  assert.match(route, /const synchronousReadOnlyTurn = ordinaryConversationTurn && !externalActionRequested/)
  assert.match(route, /if \(synchronousReadOnlyTurn\)/)
  assert.match(route, /await persistTurn\(/)

  assert.equal(requestsExternalAction('what is the capital of Germany?'), false)
  assert.equal(requestsExternalAction('Mam 9 godzin do zabicia w Amsterdamie w sobotę. Przygotuj mi ekonomiczny plan zwiedzania między 9 a 18.'), false)
  assert.equal(requestsExternalAction('send this email to the customer'), true)

  assert.match(route, /enqueueDurableCosTurn/)
  assert.match(route, /if \(access\?\.userId\)/)
  assert.match(route, /keeps its[\s\S]*public surface header[\s\S]*cannot inherit owner privileges/)
  assert.match(route, /after\(async \(\) =>/)
  assert.match(route, /finishDurableCosTurn/)
  assert.match(route, /turnId,/)
  assert.match(route, /status: 'running'/)
  assert.match(route, /progress: runningReply/)
  assert.doesNotMatch(route, /status: 'running',[\s\S]{0,120}reply: runningReply/)
  assert.match(route, /\{ status: 202 \}/)
  assert.match(route, /runWithTurnDeadline\(\s*requestStartedAt \+ DURABLE_TURN_MODEL_DEADLINE_MS,\s*\(\) => cosBrowserPost\(downstreamRequest\(req, body\)\)/)
  assert.match(route, /const workerResponse = await Promise\.race\(\[worker, watchdog\]\)/)
})

test('browser follows durable COS History by turn id with read-only GETs', () => {
  const client = readFileSync(join(process.cwd(), 'lib/ai/cos/agentProgressClient.ts'), 'utf8')
  assert.match(client, /findDurableCosTurnReply/)
  assert.match(client, /COS_TURN_FOREGROUND_WAIT_MS = 180_000/)
  assert.match(client, /COS_HISTORY_READ_DEADLINE_MS = 2_000/)
  assert.match(client, /PUBLIC_CONCIERGE_TRANSPORT_DEADLINE_MS = 195_000/)
  assert.match(client, /const durablePollDeadlineMs = startedAt \+ COS_TURN_FOREGROUND_WAIT_MS/)
  assert.match(client, /AbortSignal\.timeout\(historyReadBudgetMs\)/)
  assert.match(client, /source: 'cos-durable-history-deadline'/)
  assert.match(client, /status: 504/)
  const durableStart = client.indexOf("if (turnId && data?.status === 'running' && conversationId) {")
  const durableEnd = client.indexOf("const jobId = typeof data?.jobId === 'string'", durableStart)
  assert.ok(durableStart >= 0 && durableEnd > durableStart, 'durable COS polling block must remain identifiable')
  const durableBlock = client.slice(durableStart, durableEnd)
  assert.doesNotMatch(durableBlock, /return \{ ok: true, status: 202, data \}/)
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
