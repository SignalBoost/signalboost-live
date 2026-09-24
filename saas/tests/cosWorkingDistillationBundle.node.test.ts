import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkingCosBalancedBundle,
  selectWorkingCosBalancedBundleFromVault,
  workingCosTrainingRightsEligible,
} from '../lib/ai/cos/cosWorkingDistillationBundle.ts'
import { buildWorkingCosDistillationPlanFromBundle } from '../lib/ai/cos/cosWorkingDistillation.ts'

function hex(char: string, n: number): string {
  return char.repeat(n)
}

function row(subjectId: string, index: number, rights = 'governed_hosted_teacher_output') {
  const char = ((index % 6) + 10).toString(16)
  return {
    assetSetKey: hex(char, 64),
    portableManifestHash: hex(((index + 1) % 6 + 10).toString(16), 64),
    subjectId,
    itemCount: 20 + (index % 5),
    trainingRights: rights,
    modelNeutral: true,
    containsPrivateProductionData: false,
    createdAt: new Date(Date.UTC(2026, 8, 23, 20, index, 0)).toISOString(),
  }
}

const SUBJECTS = [
  'Computer Science & Coding',
  'Cybersecurity',
  'Statistics & Data Science',
  'Mathematics',
  'Physics & Natural Sciences',
  'Business & Operations',
  'Economics & Finance',
  'Language & Communication',
  'Reasoning & Decision Science',
  'Law, Regulation & Governance',
]

test('Working COS bundle selects broad subject coverage before volume', () => {
  const rows = SUBJECTS.flatMap((subject, index) => [
    row(subject, index),
    { ...row(subject, index + 20), createdAt: new Date(Date.UTC(2026, 8, 23, 22, index, 0)).toISOString() },
  ])
  const bundle = buildWorkingCosBalancedBundle(rows, {
    minSubjects: 8,
    maxSubjects: 8,
    maxItems: 220,
    rotationSeed: 'cycle-1',
  })

  assert.equal(bundle.eligible, true)
  assert.equal(bundle.subjectCount, 8)
  assert.equal(new Set(bundle.subjectIds).size, 8)
  assert.equal(bundle.assetSets.length, 8)
  assert.ok(bundle.itemCount >= 160)
  assert.match(String(bundle.bundleKey), /^[a-f0-9]{64}$/)
  assert.match(String(bundle.combinedPortableManifestHash), /^[a-f0-9]{64}$/)
  assert.equal(bundle.automaticTrainingAuthorized, false)
  assert.equal(bundle.automaticActivationAuthorized, false)
})

test('Working COS bundle excludes unknown-rights and private material', () => {
  const rows = [
    ...SUBJECTS.slice(0, 7).map((subject, index) => row(subject, index)),
    row('Cybersecurity', 10, 'unknown'),
    { ...row('Business & Operations', 11), containsPrivateProductionData: true },
  ]
  const bundle = buildWorkingCosBalancedBundle(rows, { minSubjects: 8 })

  assert.equal(bundle.eligible, false)
  assert.ok(bundle.blockers.includes('insufficient_subject_coverage'))
  assert.equal(bundle.trainingRightsEligible, false)
  assert.equal(workingCosTrainingRightsEligible('governed_hosted_teacher_output'), true)
  assert.equal(workingCosTrainingRightsEligible('open_license'), true)
  assert.equal(workingCosTrainingRightsEligible('unknown'), false)
})

test('Working COS plan binds a balanced bundle to exact runtime identity but grants no traffic', () => {
  const bundle = buildWorkingCosBalancedBundle(
    SUBJECTS.slice(0, 8).map((subject, index) => row(subject, index)),
    { minSubjects: 8, maxSubjects: 8 },
  )
  const plan = buildWorkingCosDistillationPlanFromBundle({
    enabled: true,
    bundle,
    targetBaseModel: 'qwen3:30b',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:observed-baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/rollback',
  })

  assert.equal(plan.eligible, true)
  assert.equal(plan.bundleEligible, true)
  assert.equal(plan.nextGate, 'bounded_training_dispatch')
  assert.equal(plan.productionTrafficAuthorized, false)
  assert.equal(plan.automaticActivationAuthorized, false)
  assert.equal(plan.universityGraduationClaimed, false)
})

test('Working COS plan still fails closed when the runtime model does not match the training base', () => {
  const bundle = buildWorkingCosBalancedBundle(
    SUBJECTS.slice(0, 8).map((subject, index) => row(subject, index)),
    { minSubjects: 8, maxSubjects: 8 },
  )
  const plan = buildWorkingCosDistillationPlanFromBundle({
    enabled: true,
    bundle,
    targetBaseModel: 'Qwen/Qwen3-4B',
    configuredRuntimeModel: 'qwen3:30b',
    baselineIdentity: 'runpod:qwen3:30b:observed-baseline',
    rollbackArtifactRef: 'itmounts://cos/runtime/qwen3-30b/rollback',
  })

  assert.equal(plan.eligible, false)
  assert.ok(plan.blockers.includes('target_base_model_not_current_runtime'))
})

test('vault selector is read-only and uses sealed model-neutral rows', async () => {
  const data = SUBJECTS.slice(0, 8).map((subject, index) => ({
    asset_set_key: row(subject, index).assetSetKey,
    portable_manifest_hash: row(subject, index).portableManifestHash,
    subject_id: subject,
    item_count: 20,
    training_rights: 'governed_hosted_teacher_output',
    model_neutral: true,
    contains_private_production_data: false,
    created_at: new Date(Date.UTC(2026, 8, 23, 22, index, 0)).toISOString(),
  }))
  const calls: string[] = []
  const query: any = {
    eq(column: string, value: unknown) { calls.push(`eq:${column}:${String(value)}`); return query },
    order(column: string) { calls.push(`order:${column}`); return query },
    async limit(value: number) { calls.push(`limit:${value}`); return { data, error: null } },
  }
  const db = {
    from(table: string) {
      calls.push(`from:${table}`)
      return {
        select(columns: string) {
          calls.push(`select:${columns}`)
          return query
        },
      }
    },
  }

  const bundle = await selectWorkingCosBalancedBundleFromVault({ minSubjects: 8, maxSubjects: 8 }, db)
  assert.equal(bundle.eligible, true)
  assert.equal(bundle.vaultRowsConsidered, 8)
  assert.equal(bundle.semantics, 'read_only_balanced_working_cos_bundle_selection_no_training_no_runtime_mutation')
  assert.ok(calls.includes('from:cos_university_distillation_asset_sets'))
  assert.ok(calls.includes('eq:model_neutral:true'))
  assert.ok(calls.includes('eq:contains_private_production_data:false'))
})
