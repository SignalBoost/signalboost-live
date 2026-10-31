// saas/tests/cosCustomerTaskAdmission.node.test.ts
// Gate 1: every signed-in request-path COS turn is one customer task, admitted before it runs and finished with the
// answer that was delivered. Behavioural tests on the runner the ingress uses, plus the stored History shape.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COS_TURN_SCHEMA,
  cosTurnHistoryProvenance,
  historyCosTurnId,
  runAdmittedCosTurn,
  type AdmittedCosTurnOutcome,
} from '../lib/ai/cos/durableCosTurn.ts'

const TASK = '11111111-1111-4111-8111-111111111111'
const HISTORY = '22222222-2222-4222-8222-222222222222'

function answered(reply: string): AdmittedCosTurnOutcome {
  return {
    status: 'succeeded', reply, source: 'cos-primary',
    executionProvenance: { turnId: 'reasoner-turn-1', schema_version: 5 },
    answerProvenance: null, deliveredVisual: null, error: null,
  }
}

function harness(options: { admitFails?: boolean; runThrows?: boolean; reply?: string | null } = {}) {
  const calls: string[] = []
  const finished: Array<AdmittedCosTurnOutcome & { historyMessageId: string }> = []
  const storedWithoutTask: AdmittedCosTurnOutcome[] = []
  const run = () => runAdmittedCosTurn({
    admit: async () => {
      calls.push('admit')
      if (options.admitFails) throw new Error('cos_task_admission: database unavailable')
      return { historyMessageId: HISTORY }
    },
    run: async () => {
      calls.push('run')
      if (options.runThrows) throw new Error('worker crashed')
      return { reply: options.reply === undefined ? 'The answer.' : options.reply }
    },
    outcome: async result => result.reply ? answered(result.reply) : null,
    finish: async outcome => { calls.push('finish'); finished.push(outcome) },
    storeWithoutTask: async outcome => { calls.push('store'); storedWithoutTask.push(outcome) },
    afterStored: async () => { calls.push('summary') },
    failedReply: 'COS could not finish this turn.',
  })
  return { calls, finished, storedWithoutTask, run }
}

test('the task is admitted before the turn runs and finished with the delivered answer', async () => {
  const h = harness()
  const result = await h.run()
  assert.deepEqual(result, { reply: 'The answer.' })
  assert.deepEqual(h.calls, ['admit', 'run', 'finish', 'summary'])
  assert.equal(h.finished[0].historyMessageId, HISTORY)
  assert.equal(h.finished[0].status, 'succeeded')
  assert.equal(h.finished[0].reply, 'The answer.')
  assert.equal(h.storedWithoutTask.length, 0)
})

test('a turn that throws fails its task and the error still reaches the caller', async () => {
  const h = harness({ runThrows: true })
  await assert.rejects(h.run(), /worker crashed/)
  assert.deepEqual(h.calls, ['admit', 'run', 'finish', 'summary'])
  assert.equal(h.finished[0].status, 'failed')
  assert.equal(h.finished[0].reply, 'COS could not finish this turn.')
  assert.equal(h.finished[0].error, 'worker crashed')
})

test('a turn that delivers no reply still terminates its task, never leaving it running', async () => {
  const h = harness({ reply: null })
  await h.run()
  assert.equal(h.finished.length, 1)
  assert.equal(h.finished[0].status, 'failed')
  assert.equal(h.finished[0].error, 'cos_turn_no_reply')
})

test('admission failure never withholds the answer; the exchange is stored without a task', async () => {
  const h = harness({ admitFails: true })
  const result = await h.run()
  assert.deepEqual(result, { reply: 'The answer.' })
  assert.deepEqual(h.calls, ['admit', 'run', 'store', 'summary'])
  assert.equal(h.finished.length, 0)
})

test('a storage fault after the answer is produced is logged, not turned into a failed answer', async () => {
  const result = await runAdmittedCosTurn({
    admit: async () => ({ historyMessageId: HISTORY }),
    run: async () => 'delivered',
    outcome: async () => answered('delivered'),
    finish: async () => { throw new Error('cos_task_finish_not_committed') },
    storeWithoutTask: async () => undefined,
    failedReply: 'x',
  })
  assert.equal(result, 'delivered')
})

test('History keeps execution fields and the delivered chart on top, the task id as turnId, the reasoner id as cosTurnId', () => {
  const stored = cosTurnHistoryProvenance({
    turnId: TASK,
    status: 'succeeded',
    source: 'cos-primary',
    executionProvenance: { turnId: 'reasoner-turn-1', schema: 'spoofed', status: 'spoofed', response_source: 'cos-primary', schema_version: 5 },
    deliveredVisual: { kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
  })
  assert.equal(stored.schema, COS_TURN_SCHEMA)
  assert.equal(stored.turnId, TASK)
  assert.equal(stored.status, 'succeeded')
  assert.equal(stored.cosTurnId, 'reasoner-turn-1')
  assert.equal(stored.response_source, 'cos-primary')
  assert.equal('execution_provenance' in stored, false)
  assert.equal(historyCosTurnId(stored), 'reasoner-turn-1')
  // An ordinary (non-task) History row keeps its reasoner turn id as turnId.
  assert.equal(historyCosTurnId({ turnId: 'reasoner-turn-2' }), 'reasoner-turn-2')
  assert.equal(historyCosTurnId(null), '')
})

test('the ingress admits every signed-in request-path turn, reusing the client send id', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cos-provenance-browser/route.ts'), 'utf8')
  const start = route.indexOf('GATE 1 — ONE CUSTOMER TASK PER REQUEST')
  assert.ok(start > 0)
  const block = route.slice(start)
  assert.match(block, /const access = ordinaryConversationTurn \? await getAccess\(\)/)
  assert.match(block, /if \(!userId\) return executeTurn\(\)/)
  assert.match(block, /const taskId = clientTurnId \?\? crypto\.randomUUID\(\)/)
  assert.match(block, /return runAdmittedCosTurn\(\{/)
  assert.match(block, /finish: outcome => finishDurableCosTurn\(\{ turnId: taskId, userId, \.\.\.outcome \}\)/)
  assert.doesNotMatch(route, /synchronousReadOnlyTurn/)
  assert.match(readFileSync(join(process.cwd(), 'app/api/assistant/feedback/route.ts'), 'utf8'), /historyCosTurnId\(assistantMessage\?\.provenance\)/)
  assert.match(readFileSync(join(process.cwd(), 'lib/ai/cos/cosOwnerVerifiedOutcomes.ts'), 'utf8'), /historyCosTurnId\(row\?\.provenance\)/)
  assert.match(readFileSync(join(process.cwd(), 'lib/ai/cos/cosWorkforceVerificationTrace.ts'), 'utf8'), /provenance->>cosTurnId/)
})
