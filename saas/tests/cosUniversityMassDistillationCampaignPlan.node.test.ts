import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MASS_DISTILLATION_JOBS_PER_BATCH,
  MASS_DISTILLATION_PER_BATCH_MAX_ESTIMATED_COST_USD,
  summarizeMassDistillationCampaign,
} from '../lib/ai/cos/cosUniversityMassDistillationCampaignPlan.ts'

const rows = [
  { batch_key: 'a'.repeat(64), subject_id: 'Data Structures', source_count: 107, student_model_id: 'Qwen/Qwen3-4B', dispatch_authorized: false },
  { batch_key: 'b'.repeat(64), subject_id: 'Machine Learning', source_count: 32, student_model_id: 'Qwen/Qwen3-4B', dispatch_authorized: false },
  { batch_key: 'c'.repeat(64), subject_id: 'Ignored authorized row', source_count: 99, student_model_id: 'Qwen/Qwen3-4B', dispatch_authorized: true },
]

test('mass campaign plan derives its maximum from existing hard one-time ceilings', () => {
  assert.equal(MASS_DISTILLATION_JOBS_PER_BATCH, 3)
  assert.equal(MASS_DISTILLATION_PER_BATCH_MAX_ESTIMATED_COST_USD, 1.825)
  const plan = summarizeMassDistillationCampaign(rows)
  assert.equal(plan.preparedBatches, 2)
  assert.equal(plan.selectedBatches, 2)
  assert.equal(plan.sourceItems, 139)
  assert.equal(plan.totalJobs, 6)
  assert.equal(plan.maximumAuthorizedCostUsd, 3.65)
  assert.deepEqual(plan.costCaps, {
    teacherUsd: 0.2,
    datasetPreparationUsd: 0.015,
    studentTrainingUsd: 1.61,
  })
})

test('campaign planning never grants dispatch, promotion, authority or provider mutation', () => {
  const plan = summarizeMassDistillationCampaign(rows, 1)
  assert.equal(plan.selectedBatches, 1)
  assert.equal(plan.maximumAuthorizedCostUsd, 1.825)
  assert.equal(plan.dispatchAuthorized, false)
  assert.equal(plan.providerMutation, false)
  assert.equal(plan.automaticPromotionAuthorized, false)
  assert.equal(plan.authorityExpanded, false)
  assert.equal(plan.nextGate, 'explicit_owner_campaign_budget')
  assert.match(plan.semantics, /read_only/)
  assert.match(plan.semantics, /no_spend/)
})
