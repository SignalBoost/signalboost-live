import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDistillationDatasetBinding,
  deriveDistillationFailureQualification,
  COS_UNIVERSITY_DISTILLATION_PREPARATION_PROFILE,
} from '../lib/ai/cos/cosUniversityDistillationPreparation.ts'
import { buildDistillationTrainingPlan } from '../lib/ai/cos/cosUniversityDistillationDatasetPlan.ts'
import { controlledFineTuneDatasetHash } from '../lib/ai/cos/cosUniversityTrainingIdentity.ts'

const H = (char: string) => char.repeat(64)
const exam = (id: string, at: string, status: 'failed' | 'passed', manifest = H('a')) => ({
  id,
  profile: 'cos_university_unseen_v1',
  status,
  manifest_hash: manifest,
  completed_at: at,
})

const qualificationEvidence = {
  distillationQualification: {
    profile: COS_UNIVERSITY_DISTILLATION_PREPARATION_PROFILE,
    eligible: true,
    repeatedFailures: 3,
    independentRetestFailures: 2,
    failedRunIds: ['run-1', 'run-2', 'run-3'],
    manifestHashes: [H('a'), H('b')],
    latestFailureAt: '2026-09-13T19:00:00.000Z',
    lastPassAt: null,
  },
}

const sourcePlan = {
  id: '7bb8ce24-e3b3-488a-9cd1-29a3898c5862',
  plan_key: H('c'),
  agent_id: 'software-specialist',
  subject_id: 'reasoning_decision_science',
  language_code: null,
  language_dimension: null,
  failure_class: 'unknown',
  objective: 'Remediate repeated unseen reasoning failures.',
  methods: [{ id: 'independent_retest', execution: 'automatic_if_certifiable', reason: 'Prove transfer.' }],
  acquisition_source_kinds: [],
  source_ref: 'b333a2be-6826-452c-89c6-d72ab9e007a5',
  fine_tune_candidate: true,
  status: 'queued',
  evidence: qualificationEvidence,
} as const

const itemHashes = Array.from({ length: 20 }, (_, index) => index.toString(16).padStart(64, '0'))
const datasetInput = {
  teacherModelId: 'Qwen/Qwen3.6-35B-A3B',
  studentModelId: 'Qwen/Qwen3-8B',
  studentControlledByBuyer: true,
  sourceRef: `hf://datasets/cadomos/itmounts-teacher@${'a'.repeat(40)}#train`,
  provenanceRefs: ['license:apache-2.0', 'teacher-batch:sha256:abc'],
  trainingRights: 'open_license' as const,
  containsPrivateProductionData: false,
  teacherOutputItemHashes: itemHashes,
}

test('replaying the same unseen manifest cannot manufacture independent retest failures', () => {
  const result = deriveDistillationFailureQualification([
    exam('run-3', '2026-09-13T03:00:00Z', 'failed', H('a')),
    exam('run-2', '2026-09-13T02:00:00Z', 'failed', H('a')),
    exam('run-1', '2026-09-13T01:00:00Z', 'failed', H('a')),
  ])
  assert.equal(result.repeatedFailures, 3)
  assert.equal(result.independentRetestFailures, 1)
  assert.equal(result.eligible, false)
  assert.ok(result.blockers.includes('independent_retest_threshold_not_met'))
})

test('three unresolved failures across at least two unseen manifests qualify candidate preparation', () => {
  const result = deriveDistillationFailureQualification([
    exam('run-3', '2026-09-13T03:00:00Z', 'failed', H('c')),
    exam('run-2', '2026-09-13T02:00:00Z', 'failed', H('b')),
    exam('run-1', '2026-09-13T01:00:00Z', 'failed', H('a')),
  ])
  assert.equal(result.eligible, true)
  assert.equal(result.repeatedFailures, 3)
  assert.equal(result.independentRetestFailures, 3)
})

test('a newer pass resets the failure episode and blocks escalation', () => {
  const result = deriveDistillationFailureQualification([
    exam('pass', '2026-09-13T04:00:00Z', 'passed', H('d')),
    exam('run-3', '2026-09-13T03:00:00Z', 'failed', H('c')),
    exam('run-2', '2026-09-13T02:00:00Z', 'failed', H('b')),
    exam('run-1', '2026-09-13T01:00:00Z', 'failed', H('a')),
  ])
  assert.equal(result.eligible, false)
  assert.equal(result.repeatedFailures, 0)
  assert.ok(result.blockers.includes('latest_unseen_outcome_not_failed'))
})

test('new failures after an older pass form a new independent escalation episode', () => {
  const result = deriveDistillationFailureQualification([
    exam('run-4', '2026-09-13T05:00:00Z', 'failed', H('e')),
    exam('run-3', '2026-09-13T04:00:00Z', 'failed', H('d')),
    exam('run-2', '2026-09-13T03:00:00Z', 'failed', H('c')),
    exam('pass', '2026-09-13T02:00:00Z', 'passed', H('b')),
    exam('old-fail', '2026-09-13T01:00:00Z', 'failed', H('a')),
  ])
  assert.equal(result.eligible, true)
  assert.equal(result.repeatedFailures, 3)
  assert.equal(result.failedRunIds.includes('old-fail'), false)
})

test('teacher-output dataset registration requires an immutable HF commit and at least 20 unique items', () => {
  for (const sourceRef of [
    'hf://datasets/cadomos/itmounts-teacher#train',
    'hf://datasets/cadomos/itmounts-teacher@main#train',
  ]) {
    const unpinned = buildDistillationDatasetBinding({ ...datasetInput, sourceRef, plan: sourcePlan })
    assert.equal(unpinned.eligible, false)
    assert.ok(unpinned.blockers.includes('distillation_dataset_revision_not_pinned'))
  }

  const tooSmall = buildDistillationDatasetBinding({
    ...datasetInput,
    teacherOutputItemHashes: itemHashes.slice(0, 19),
    plan: sourcePlan,
  })
  assert.equal(tooSmall.eligible, false)
  assert.ok(tooSmall.blockers.includes('teacher_output_dataset_too_small'))
})

test('rights, privacy, buyer control, provenance and qualification remain mandatory for a valid binding', () => {
  const valid = buildDistillationDatasetBinding({ ...datasetInput, plan: sourcePlan })
  assert.equal(valid.eligible, true)
  assert.equal(valid.candidate?.trainingRights, 'open_license')
  assert.equal(valid.candidate?.studentControlledByBuyer, true)
  assert.equal(valid.candidate?.containsPrivateProductionData, false)
  assert.equal(valid.candidate?.repeatedFailures, 3)
  assert.equal(valid.candidate?.independentRetestFailures, 2)
  assert.match(valid.datasetHash || '', /^[a-f0-9]{64}$/)
  assert.match(valid.teacherOutputManifestHash || '', /^[a-f0-9]{64}$/)

  const uncontrolled = buildDistillationDatasetBinding({ ...datasetInput, studentControlledByBuyer: false, plan: sourcePlan })
  assert.equal(uncontrolled.eligible, false)
  assert.ok(uncontrolled.blockers.includes('student_not_buyer_controlled'))

  const privateData = buildDistillationDatasetBinding({ ...datasetInput, containsPrivateProductionData: true, plan: sourcePlan })
  assert.equal(privateData.eligible, false)
  assert.ok(privateData.blockers.includes('private_production_data_present'))
})

test('dedicated training plan preserves remediation lineage and binds the HF dataset independently', () => {
  const built = buildDistillationTrainingPlan({ ...datasetInput, sourcePlan })
  assert.equal(built.eligible, true)
  assert.ok(built.plan)
  assert.equal(sourcePlan.source_ref, 'b333a2be-6826-452c-89c6-d72ab9e007a5')
  assert.equal(built.plan?.source_ref, datasetInput.sourceRef)
  assert.equal((built.plan?.evidence as any).sourceCandidateId, `study-plan:${sourcePlan.id}`)
  assert.equal(built.candidate?.datasetHash, controlledFineTuneDatasetHash(built.plan!))
  assert.equal((built.plan?.evidence as any).autoExecuteTraining, false)
})
