import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyExecutionOutcome } from '../lib/ai/cos/cosExecutionVerdict.ts'

test('reply language cannot certify or reject execution', () => {
  assert.equal(verifyExecutionOutcome({ httpOk: true, payload: { reply: 'Campaign launched' } }), 'failed')
  assert.equal(verifyExecutionOutcome({ httpOk: true, payload: { reply: 'I cannot execute that', external_action_taken: true } }), 'succeeded')
})

test('runtime receipts govern durable execution status', () => {
  assert.equal(verifyExecutionOutcome({ httpOk: true, payload: { status: 'running', jobId: '123' } }), 'pending')
  assert.equal(verifyExecutionOutcome({ httpOk: true, payload: { status: 'succeeded', execution_allowed: true } }), 'succeeded')
  assert.equal(verifyExecutionOutcome({ httpOk: false, payload: { external_action_taken: true } }), 'failed')
  assert.equal(verifyExecutionOutcome({ httpOk: true, payload: { status: 'failed' } }), 'failed')
})
