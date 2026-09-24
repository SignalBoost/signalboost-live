import assert from 'node:assert/strict'
import test from 'node:test'
import { registerWorkingCosDistillationCandidate } from '../lib/ai/cos/cosWorkingDistillationCandidateRegistry.ts'

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)
const HEX_C = 'c'.repeat(64)
const HEX_D = 'd'.repeat(64)

function eligibleBundle() {
  return {
    profile: 'cos-working-distillation-balanced-bundle-v1',
    eligible: true,
    bundleKey: HEX_A,
    combinedPortableManifestHash: HEX_B,
    itemCount: 160,
    subjectCount: 8,
    subjectIds: ['Business','Computer Science','Cybersecurity','Economics','Language','Math','Reasoning','Statistics'],
    assetSetKeys: [HEX_C, HEX_D, '1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64), '5'.repeat(64), '6'.repeat(64)],
    modelNeutral: true,
    containsPrivateProductionData: false,
    trainingRightsEligible: true,
    blockers: [],
  } as const
}

function dbRecorder() {
  const calls:any[] = []
  return {
    calls,
    from(table:string) {
      assert.equal(table, 'cos_working_distillation_candidates')
      return {
        async upsert(row:any, options:any) {
          calls.push({ row, options })
          return { error: null }
        },
      }
    },
  }
}

test('registers one immutable balanced Working-COS candidate without training or traffic authority', async () => {
  const db = dbRecorder()
  const result = await registerWorkingCosDistillationCandidate({
    enabled: true,
    bundle: eligibleBundle(),
    targetBaseModel: 'qwen3:30b',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:observed-baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/baseline',
  }, db)

  assert.equal(result.registered, true)
  assert.match(result.candidateId!, /^working-cos:/)
  assert.equal(result.subjectCount, 8)
  assert.equal(result.nextGate, 'bounded_training_dispatch')
  assert.equal(result.automaticTrainingAuthorized, false)
  assert.equal(result.automaticActivationAuthorized, false)
  assert.equal(result.productionTrafficAuthorized, false)
  assert.equal(result.universityGraduationClaimed, false)
  assert.equal(result.authorityExpanded, false)

  assert.equal(db.calls.length, 1)
  const { row, options } = db.calls[0]
  assert.match(row.candidate_key, /^[a-f0-9]{64}$/)
  assert.equal(row.status, 'registered')
  assert.equal(row.target_base_model, 'qwen3:30b')
  assert.equal(row.configured_runtime_model, 'qwen3:30b')
  assert.equal(row.bundle_key, HEX_A)
  assert.equal(row.portable_manifest_hash, HEX_B)
  assert.equal(row.automatic_training_authorized, false)
  assert.equal(row.production_traffic_authorized, false)
  assert.deepEqual(options, { onConflict: 'candidate_key', ignoreDuplicates: true })
})

test('candidate registration fails closed when runtime identity does not match', async () => {
  const db = dbRecorder()
  const result = await registerWorkingCosDistillationCandidate({
    enabled: true,
    bundle: eligibleBundle(),
    targetBaseModel: 'Qwen/Qwen3-4B',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:observed-baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/baseline',
  }, db)

  assert.equal(result.registered, false)
  assert.ok(result.blockers.includes('target_base_model_not_current_runtime'))
  assert.equal(db.calls.length, 0)
})

test('candidate registration fails closed without a rollback target', async () => {
  const db = dbRecorder()
  const result = await registerWorkingCosDistillationCandidate({
    enabled: true,
    bundle: eligibleBundle(),
    targetBaseModel: 'qwen3:30b',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:observed-baseline',
    rollbackArtifactRef: '',
  }, db)

  assert.equal(result.registered, false)
  assert.ok(result.blockers.includes('rollback_target_missing'))
  assert.equal(db.calls.length, 0)
})

test('candidate registration cannot turn an ineligible/private bundle into authority', async () => {
  const db = dbRecorder()
  const bundle = {
    ...eligibleBundle(),
    eligible: false,
    containsPrivateProductionData: true,
    trainingRightsEligible: false,
    blockers: ['private_material'],
  } as const
  const result = await registerWorkingCosDistillationCandidate({
    enabled: true,
    bundle,
    targetBaseModel: 'qwen3:30b',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:observed-baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/baseline',
  }, db)

  assert.equal(result.registered, false)
  assert.equal(db.calls.length, 0)
})
