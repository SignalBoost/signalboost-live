import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkingCosDistillationPlan,
  COS_WORKING_DISTILLATION_MIN_ITEMS,
} from '../lib/ai/cos/cosWorkingDistillation.ts'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)

test('Working COS lane binds portable assets to the exact current COS model without granting activation', () => {
  const plan = buildWorkingCosDistillationPlan({
    enabled: true,
    assetSetKey: HEX_A,
    portableManifestHash: HEX_B,
    itemCount: COS_WORKING_DISTILLATION_MIN_ITEMS,
    assetSetSealed: true,
    modelNeutral: true,
    containsPrivateProductionData: false,
    trainingRightsEligible: true,
    targetBaseModel: 'qwen3:30b',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/baseline',
  })

  assert.equal(plan.eligible, true)
  assert.match(String(plan.candidateId), /^working-cos:/)
  assert.equal(plan.nextGate, 'bounded_training_dispatch')
  assert.equal(plan.inPlaceMutationAuthorized, false)
  assert.equal(plan.automaticActivationAuthorized, false)
  assert.equal(plan.productionTrafficAuthorized, false)
  assert.equal(plan.universityGraduationClaimed, false)
})

test('Working COS lane fails closed when the proposed base model is not the current COS runtime', () => {
  const plan = buildWorkingCosDistillationPlan({
    enabled: true,
    assetSetKey: HEX_A,
    portableManifestHash: HEX_B,
    itemCount: 40,
    assetSetSealed: true,
    modelNeutral: true,
    containsPrivateProductionData: false,
    trainingRightsEligible: true,
    targetBaseModel: 'Qwen/Qwen3-4B',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/baseline',
  })

  assert.equal(plan.eligible, false)
  assert.ok(plan.blockers.includes('target_base_model_not_current_runtime'))
  assert.equal(plan.nextGate, 'blocked')
})

test('Working COS lane rejects unsealed, rights-ineligible, private, or undersized material', () => {
  const plan = buildWorkingCosDistillationPlan({
    enabled: true,
    assetSetKey: HEX_A,
    portableManifestHash: HEX_B,
    itemCount: COS_WORKING_DISTILLATION_MIN_ITEMS - 1,
    assetSetSealed: false,
    modelNeutral: true,
    containsPrivateProductionData: true,
    trainingRightsEligible: false,
    targetBaseModel: 'qwen3:30b',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/baseline',
  })

  assert.equal(plan.eligible, false)
  assert.ok(plan.blockers.includes('asset_set_unsealed'))
  assert.ok(plan.blockers.includes('insufficient_training_items'))
  assert.ok(plan.blockers.includes('private_production_data_forbidden'))
  assert.ok(plan.blockers.includes('training_rights_not_eligible'))
})
