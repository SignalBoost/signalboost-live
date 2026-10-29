import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDurableCosTurnReply, findRecoveredAssistantReply } from '../lib/ai/cos/assistantTransportRecovery.ts'
import { isExternalActionCommand } from '../lib/ai/cos/externalActionCommandIntent.ts'

test('read-only COS questions stay synchronous while non-replayable actions keep durable 202', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  assert.match(route, /requestsExternalAction/)
  assert.match(route, /const durableConversationTurn = ordinaryConversationTurn && externalActionRequested/)
  assert.match(route, /const synchronousReadOnlyTurn = ordinaryConversationTurn && !externalActionRequested/)
  assert.match(route, /if \(synchronousReadOnlyTurn\)/)
  assert.match(route, /await persistTurn\(/)

  assert.equal(isExternalActionCommand('what is the capital of Germany?'), false)
  assert.equal(isExternalActionCommand('Mam 9 godzin do zabicia w Amsterdamie w sobotę. Przygotuj mi ekonomiczny plan zwiedzania między 9 a 18.'), false)
  assert.equal(isExternalActionCommand('send this email to the customer'), true)

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


test('failed durable turn is never recovered as successful History answer', () => {
  const sentAt = Date.now()
  const failed = [
    { role: 'user', content: 'send invoice', created_at: new Date(sentAt).toISOString() },
    { role: 'assistant', content: 'COS failed to send invoice', created_at: new Date(sentAt).toISOString(),
      provenance: { schema: 'signalboost-cos-turn-v1', turnId: '11111111-1111-4111-8111-111111111111', status: 'failed' } },
  ]
  assert.equal(findRecoveredAssistantReply(failed, 'send invoice', sentAt), null)
  assert.deepEqual(findDurableCosTurnReply(failed, '11111111-1111-4111-8111-111111111111'),
    { content: 'COS failed to send invoice', status: 'failed' })
})

test('external-action durable admission failure must fail closed, never execute synchronously', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  const start = route.indexOf("console.error('[cos_durable_turn_enqueue_failed]'")
  const fallback = route.indexOf('// Direct (non-durable) turns', start)
  assert.ok(start >= 0 && fallback > start)
  const block = route.slice(start, fallback)
  assert.match(block, /error: 'cos_task_admission_unavailable'/)
  assert.match(block, /external_action_taken: false/)
  assert.match(block, /status: 503/)
  assert.match(block, /return NextResponse\.json\(/)
})

test('stale COS recovery uses the same atomic canonical task transition as normal completion', () => {
  const store = readFileSync(join(process.cwd(), 'lib/ai/cos/durableCosTurn.ts'), 'utf8')
  const stale = store.slice(store.indexOf('export async function expireStaleDurableCosTurns'))
  assert.match(stale, /db\\.rpc\\('finish_cos_customer_task'/)
  assert.match(stale, /p_task_id: turnId/)
  assert.match(stale, /p_history_message_id: row\\.id/)
  assert.match(stale, /p_status: 'failed'/)
  assert.match(stale, /p_error: 'worker_lost'/)
  assert.doesNotMatch(stale, /db\\.from\\('assistant_messages'\\)\\s*\\.update\\(/)
  assert.match(stale, /committed === true/)
})

test('durable COS completion persists History and task through one atomic RPC', () => {
  const store = readFileSync(join(process.cwd(), 'lib/ai/cos/durableCosTurn.ts'), 'utf8')
  const finish = store.slice(store.indexOf('export async function finishDurableCosTurn'), store.indexOf('export async function expireStaleDurableCosTurns'))
  assert.match(finish, /db\\.rpc\\('finish_cos_customer_task'/)
  assert.doesNotMatch(finish, /db\\.from\\('assistant_messages'\\)/)
  assert.doesNotMatch(finish, /db\\.from\\('builder_jobs'\\)/)
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261029230000_cos_customer_task_atomic_finish.sql'), 'utf8')
  assert.match(migration, /for update/i)
  assert.match(migration, /raise exception 'cos_turn_finish_not_committed'/i)
})
