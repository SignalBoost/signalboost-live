import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FAILURE_DERIVED_REPLAY_PROOF_MIN_EPOCHS,
  FAILURE_DERIVED_REPLAY_PROOF_MIN_LEARNING_RATE,
  isStrengthenedFailureDerivedReplayReceipt,
} from '../lib/ai/cos/cosUniversityFailureDerivedReplayReceipt.ts'

const intendedUse = (receipt: Record<string, unknown>) => ({ trainingReceipt: receipt })

test('old weak post-GKD replay receipts cannot satisfy the strengthened proof cohort', () => {
  assert.equal(isStrengthenedFailureDerivedReplayReceipt(intendedUse({
    failureDerivedReplayRequired: true,
    failureDerivedReplayItems: 5,
    failureDerivedReplayEpochs: 1,
    failureDerivedReplayLearningRate: 2e-5,
    failureDerivedReplayTrainer: 'SFTTrainer',
  })), false)
})

test('current three-epoch replay receipt satisfies the strengthened proof cohort without weakening item gates', () => {
  assert.equal(FAILURE_DERIVED_REPLAY_PROOF_MIN_EPOCHS, 3)
  assert.equal(FAILURE_DERIVED_REPLAY_PROOF_MIN_LEARNING_RATE, 5e-5)
  assert.equal(isStrengthenedFailureDerivedReplayReceipt(intendedUse({
    failureDerivedReplayRequired: true,
    failureDerivedReplayItems: 1,
    failureDerivedReplayEpochs: 3,
    failureDerivedReplayLearningRate: 5e-5,
    failureDerivedReplayTrainer: 'SFTTrainer',
  })), true)
  assert.equal(isStrengthenedFailureDerivedReplayReceipt(intendedUse({
    failureDerivedReplayRequired: true,
    failureDerivedReplayItems: 0,
    failureDerivedReplayEpochs: 3,
    failureDerivedReplayLearningRate: 5e-5,
    failureDerivedReplayTrainer: 'SFTTrainer',
  })), false)
})

test('wrong trainer or malformed evidence fails closed', () => {
  assert.equal(isStrengthenedFailureDerivedReplayReceipt(null), false)
  assert.equal(isStrengthenedFailureDerivedReplayReceipt({}), false)
  assert.equal(isStrengthenedFailureDerivedReplayReceipt(intendedUse({
    failureDerivedReplayRequired: true,
    failureDerivedReplayItems: 3,
    failureDerivedReplayEpochs: 3,
    failureDerivedReplayLearningRate: 5e-5,
    failureDerivedReplayTrainer: 'OtherTrainer',
  })), false)
})
