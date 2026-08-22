import assert from 'node:assert/strict'
import test from 'node:test'
import {
  currentReasoningEvaluationContext,
  withReasoningEvaluationContext,
} from '../lib/ai/cos/reasoningEvaluationContext.ts'

test('controlled comparison context is request scoped and restored after execution', async () => {
  assert.equal(currentReasoningEvaluationContext(), null)
  await withReasoningEvaluationContext({
    source: 'controlled_comparison',
    runId: 'run-1',
    candidateId: 'coder-1',
    workerRole: 'coder',
  }, async () => {
    assert.deepEqual(currentReasoningEvaluationContext(), {
      source: 'controlled_comparison',
      runId: 'run-1',
      candidateId: 'coder-1',
      workerRole: 'coder',
    })
    await Promise.resolve()
    assert.equal(currentReasoningEvaluationContext()?.workerRole, 'coder')
  })
  assert.equal(currentReasoningEvaluationContext(), null)
})

test('nested comparison context restores its parent candidate', async () => {
  await withReasoningEvaluationContext({
    source: 'controlled_comparison',
    runId: 'run-2',
    candidateId: 'primary-1',
    workerRole: 'primary',
  }, async () => {
    await withReasoningEvaluationContext({
      source: 'controlled_comparison',
      runId: 'run-2',
      candidateId: 'critic-2',
      workerRole: 'critic',
    }, async () => {
      assert.equal(currentReasoningEvaluationContext()?.workerRole, 'critic')
    })
    assert.equal(currentReasoningEvaluationContext()?.workerRole, 'primary')
  })
})

test('blank comparison identifiers fail closed', async () => {
  await assert.rejects(() => withReasoningEvaluationContext({
    source: 'controlled_comparison',
    runId: ' ',
    candidateId: 'coder-1',
    workerRole: 'coder',
  }, async () => undefined), /requires runId and candidateId/)
})
