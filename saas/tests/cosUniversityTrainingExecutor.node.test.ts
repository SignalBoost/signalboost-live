// saas/tests/cosUniversityTrainingExecutor.node.test.ts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  requireExplicitTrainingDispatchConfirmation,
  signTrainingExecutorPayload,
  trainingExecutorConfigFromEnv,
  trainingExecutorReadiness,
  TRAINING_EXECUTOR_CLAIMS,
  validateDistillationTrainingBinding,
  validateTrainingExecutorPartition,
  verifyTrainingExecutorPayload,
} from '../lib/ai/cos/cosUniversityTrainingExecutor.ts'
import { controlledFineTuneDatasetHash } from '../lib/ai/cos/cosUniversityTrainingIdentity.ts'
import type { FineTuneRevision } from '../lib/ai/cos/cosUniversityFineTuneEvidence.ts'
import type { ModelDistillationCandidateInput } from '../lib/ai/cos/cosUniversityModelDistillation.ts'

const H = 'a'.repeat(64)
const revision: FineTuneRevision = {
  baseModel: 'buyer-local-student',
  datasetHash: H,
  trainingManifestHash: 'b'.repeat(64),
  holdoutManifestHash: 'c'.repeat(64),
}
const distillation = (patch: Partial<ModelDistillationCandidateInput> = {}): ModelDistillationCandidateInput => ({
  teacherModelId: 'owned-teacher',
  studentModelId: revision.baseModel,
  datasetHash: revision.datasetHash,
  provenanceRefs: ['teacher-output:batch-1'],
  trainingRights: 'owned',
  studentControlledByBuyer: true,
  containsPrivateProductionData: false,
  repeatedFailures: 3,
  independentRetestFailures: 2,
  ...patch,
})

test('training executor is fail-closed and never enabled by endpoint presence alone', () => {
  assert.equal(trainingExecutorConfigFromEnv({}), null)
  assert.equal(trainingExecutorConfigFromEnv({
    COS_UNIVERSITY_TRAINING_EXECUTOR_URL: 'http://trainer.example.com',
    COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET: 's'.repeat(64),
  }), null)
  assert.equal(trainingExecutorConfigFromEnv({
    COS_UNIVERSITY_TRAINING_EXECUTOR_URL: 'https://user:pass@trainer.example.com',
    COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET: 's'.repeat(64),
  }), null)
  const configured = trainingExecutorConfigFromEnv({
    COS_UNIVERSITY_TRAINING_EXECUTOR_URL: 'https://trainer.example.com/jobs',
    COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET: 's'.repeat(64),
  })
  assert.ok(configured)
  assert.equal(configured?.dispatchEnabled, false)
  assert.deepEqual(trainingExecutorReadiness({
    COS_UNIVERSITY_TRAINING_EXECUTOR_URL: 'https://trainer.example.com/jobs',
    COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET: 's'.repeat(64),
  }), {
    configured: true,
    dispatchEnabled: false,
    endpoint: 'https://trainer.example.com',
    semantics: 'buyer_controlled_https_executor_no_hosted_fallback',
  })
})

test('each cost-bearing dispatch requires explicit owner intent', () => {
  assert.throws(() => requireExplicitTrainingDispatchConfirmation(false), /explicit_confirmation_required/)
  assert.throws(() => requireExplicitTrainingDispatchConfirmation(undefined), /explicit_confirmation_required/)
  assert.equal(requireExplicitTrainingDispatchConfirmation(true), true)
})

test('executor HMAC binds timestamp, idempotency key and exact body and rejects stale or tampered evidence', () => {
  const secret = 'k'.repeat(64)
  const timestamp = '2026-09-13T04:10:00.000Z'
  const idempotencyKey = 'job-key'
  const rawBody = JSON.stringify({ accepted: true, jobId: 'job-1' })
  const signature = signTrainingExecutorPayload({ secret, timestamp, idempotencyKey, rawBody })
  assert.equal(verifyTrainingExecutorPayload({ secret, timestamp, idempotencyKey, rawBody, signature, now: new Date('2026-09-13T04:11:00Z') }), true)
  assert.equal(verifyTrainingExecutorPayload({ secret, timestamp, idempotencyKey, rawBody: `${rawBody}x`, signature, now: new Date('2026-09-13T04:11:00Z') }), false)
  assert.equal(verifyTrainingExecutorPayload({ secret, timestamp, idempotencyKey: 'other', rawBody, signature, now: new Date('2026-09-13T04:11:00Z') }), false)
  assert.equal(verifyTrainingExecutorPayload({ secret, timestamp, idempotencyKey, rawBody, signature, now: new Date('2026-09-13T04:20:00Z') }), false)
})

test('partition evidence requires nonempty disjoint valid training and holdout identities', () => {
  const valid = validateTrainingExecutorPartition({
    baseModel: 'base', datasetHash: H,
    trainingItemHashes: ['1'.repeat(64), '2'.repeat(64)],
    holdoutItemHashes: ['3'.repeat(64)],
  })
  assert.ok(valid)
  assert.equal(validateTrainingExecutorPartition({
    baseModel: 'base', datasetHash: H,
    trainingItemHashes: ['1'.repeat(64)],
    holdoutItemHashes: ['1'.repeat(64)],
  }), null)
  assert.equal(validateTrainingExecutorPartition({
    baseModel: 'base', datasetHash: H,
    trainingItemHashes: [], holdoutItemHashes: ['3'.repeat(64)],
  }), null)
})

test('canonical candidate dataset hash preserves the original controlled-fine-tuning identity', () => {
  const plan = {
    plan_key: 'plan', subject_id: 'computer_science', failure_class: 'reasoning',
    objective: 'repair the gap', methods: [{ id: 'study' }], source_ref: 'source:1',
  }
  const legacy = createHash('sha256').update(JSON.stringify({
    plan: plan.plan_key, subject: plan.subject_id, failure: plan.failure_class,
    objective: plan.objective, methods: plan.methods, source: plan.source_ref,
  })).digest('hex')
  assert.equal(controlledFineTuneDatasetHash(plan), legacy)
  const runner = readFileSync('lib/ai/cos/cosUniversityControlledFineTuning.ts', 'utf8')
  assert.match(runner, /controlledFineTuneDatasetHash\(plan\)/)
})

test('distillation dispatch inherits rights, privacy, failure thresholds and exact student/dataset binding', () => {
  assert.deepEqual(validateDistillationTrainingBinding({ candidate: distillation(), revision }), { eligible: true, blockers: [] })
  assert.ok(validateDistillationTrainingBinding({ candidate: distillation({ trainingRights: 'unknown' }), revision }).blockers.includes('training_rights_not_proven'))
  assert.ok(validateDistillationTrainingBinding({ candidate: distillation({ containsPrivateProductionData: true }), revision }).blockers.includes('private_production_data_present'))
  assert.ok(validateDistillationTrainingBinding({ candidate: distillation({ repeatedFailures: 1 }), revision }).blockers.includes('repeated_failure_threshold_not_met'))
  assert.ok(validateDistillationTrainingBinding({ candidate: distillation({ studentModelId: 'other' }), revision }).blockers.includes('controlled_student_model_mismatch'))
  assert.ok(validateDistillationTrainingBinding({ candidate: distillation({ datasetHash: 'd'.repeat(64) }), revision }).blockers.includes('controlled_dataset_mismatch'))
})

test('training executor can attest only its own partition, artifact and rollback claims', () => {
  assert.deepEqual([...TRAINING_EXECUTOR_CLAIMS], [
    'partition_manifests_registered', 'trained_artifact_registered', 'rollback_artifact_registered',
  ])
  for (const forbidden of ['independent_evaluation', 'safety_regression_passed', 'unseen_transfer_passed', 'delayed_retention_passed', 'production_canary_healthy']) {
    assert.equal((TRAINING_EXECUTOR_CLAIMS as readonly string[]).includes(forbidden), false)
  }
})

test('owner route and signed callback preserve authority separation and contain no hosted training fallback', () => {
  const owner = readFileSync('app/api/admin/cos-university-training-executor/route.ts', 'utf8')
  const callback = readFileSync('app/api/internal/cos/university-training-executor/evidence/route.ts', 'utf8')
  const executor = readFileSync('lib/ai/cos/cosUniversityTrainingExecutor.ts', 'utf8')
  assert.match(owner, /requireOwner\(\)/)
  assert.match(owner, /requireExplicitTrainingDispatchConfirmation\(body\?\.confirmDispatch\)/)
  assert.match(callback, /await req\.text\(\)/)
  assert.match(callback, /verifyTrainingExecutorPayload/)
  // Ordering must be judged on the handler, not the whole file: the import block lists these two
  // symbols alphabetically, so `record` appears before `verify` at the top and a raw indexOf over
  // the file compares import positions rather than call sites. Slice from the first export so the
  // assertion means what it says — signature verification precedes recording evidence.
  const callbackBody = callback.slice(callback.indexOf('export'))
  assert.ok(
    callbackBody.indexOf('verifyTrainingExecutorPayload') < callbackBody.indexOf('recordUniversityTrainingExecutorEvidence'),
    'signature verification must run before evidence is recorded',
  )
  assert.match(executor, /decideControlledFineTune/)
  assert.match(executor, /readFineTuneEvidence/)
  assert.match(executor, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED/)
  assert.doesNotMatch(executor, /openai|runpod|deepinfra|anthropic|gemini/i)
})
