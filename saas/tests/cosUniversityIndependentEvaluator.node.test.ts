import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE,
  INDEPENDENT_EVALUATOR_CLAIMS,
  independentEvaluatorConfigFromEnv,
  normalizeIndependentEvaluatorPayload,
  signIndependentEvaluatorPayload,
  verifyIndependentEvaluatorPayload,
} from '../lib/ai/cos/cosUniversityIndependentEvaluator.ts'

const H = 'a'.repeat(64)
const revision = {
  baseModel: 'Qwen/Qwen3-4B',
  datasetHash: H,
  trainingManifestHash: 'b'.repeat(64),
  holdoutManifestHash: 'c'.repeat(64),
}
const candidateId = 'study-plan:e23cb043-715e-4406-8898-421159fae2df'
const payload = {
  candidateId,
  claim: 'independent_evaluation' as const,
  revision,
  trainedArtifactId: 'cadomos/itmounts-student-f993a365a01e',
  artifactHash: 'd'.repeat(64),
  evaluatorId: 'itmounts-independent-evaluator-v1',
  evaluationSuiteHash: 'e'.repeat(64),
  evidenceRef: 'db://cos_university_evaluator_runs/run-1',
  verifiedSourceAttribution: true as const,
  authorityExpanded: false as const,
  baselineScore: 0.4,
  trainedArtifactScore: 0.7,
  holdoutManifestHash: revision.holdoutManifestHash,
}

test('independent evaluator credential is separate and fail-closed', () => {
  assert.equal(independentEvaluatorConfigFromEnv({}), null)
  assert.equal(independentEvaluatorConfigFromEnv({ COS_UNIVERSITY_TRAINING_EXECUTOR_SECRET: 'x'.repeat(64) }), null)
  const config = independentEvaluatorConfigFromEnv({ COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET: 'y'.repeat(64) })
  assert.equal(config?.secret, 'y'.repeat(64))
})

test('independent evaluator HMAC binds timestamp idempotency key and exact body', () => {
  const secret = 's'.repeat(64)
  const timestamp = '2026-09-14T04:00:00.000Z'
  const idempotencyKey = 'eval:1'
  const rawBody = JSON.stringify(payload)
  const signature = signIndependentEvaluatorPayload({ secret, timestamp, idempotencyKey, rawBody })
  assert.equal(verifyIndependentEvaluatorPayload({ secret, timestamp, idempotencyKey, rawBody, signature, now: new Date(timestamp) }), true)
  assert.equal(verifyIndependentEvaluatorPayload({ secret, timestamp, idempotencyKey, rawBody: `${rawBody} `, signature, now: new Date(timestamp) }), false)
  assert.equal(verifyIndependentEvaluatorPayload({ secret, timestamp, idempotencyKey: 'eval:2', rawBody, signature, now: new Date(timestamp) }), false)
  assert.equal(verifyIndependentEvaluatorPayload({ secret, timestamp, idempotencyKey, rawBody, signature, now: new Date('2026-09-14T04:06:00Z') }), false)
})

test('independent evaluation is bound to artifact holdout scores source attribution and no authority expansion', () => {
  const normalized = normalizeIndependentEvaluatorPayload(payload)
  assert.equal(normalized.claim, 'independent_evaluation')
  assert.equal(normalized.holdoutManifestHash, revision.holdoutManifestHash)
  assert.equal(normalized.baselineScore, 0.4)
  assert.equal(normalized.trainedArtifactScore, 0.7)
  assert.equal(normalized.verifiedSourceAttribution, true)
  assert.equal(normalized.authorityExpanded, false)

  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, holdoutManifestHash: 'f'.repeat(64) }), /score_or_holdout_invalid/)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, baselineScore: -1 }), /score_or_holdout_invalid/)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, trainedArtifactScore: 2 }), /score_or_holdout_invalid/)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, verifiedSourceAttribution: false }), /source_attribution_required/)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, authorityExpanded: true }), /authority_expansion_forbidden/)
})

test('independent evaluator can never mint the Production canary claim', () => {
  assert.deepEqual(INDEPENDENT_EVALUATOR_CLAIMS, [
    'independent_evaluation',
    'safety_regression_passed',
    'unseen_transfer_passed',
    'delayed_retention_passed',
  ])
  assert.equal((INDEPENDENT_EVALUATOR_CLAIMS as readonly string[]).includes('production_canary_healthy'), false)
  assert.throws(() => normalizeIndependentEvaluatorPayload({ ...payload, claim: 'production_canary_healthy' }), /claim_invalid/)
})

test('recorder requires registered artifact teacher separation and independent-scorer verifier', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentEvaluator.ts', import.meta.url), 'utf8')
  assert.match(source, /readFineTuneEvidence\(payload\.candidateId, payload\.revision, observedAt\)/)
  assert.match(source, /independent_evaluator_artifact_not_registered/)
  assert.match(source, /readCosUniversityArtifactTrainingMode/)
  assert.match(source, /teacher === payload\.evaluatorId/)
  assert.match(source, /independent_evaluator_teacher_separation_required/)
  assert.match(source, /verifier: 'independent_scorer'/)
  assert.doesNotMatch(source, /verifier: 'training_executor'/)
  assert.doesNotMatch(source, /production_canary_healthy/)
})

test('signed internal endpoint has no owner-session or training-dispatch authority', () => {
  const route = readFileSync(new URL('../app/api/internal/cos/university-independent-evaluator/evidence/route.ts', import.meta.url), 'utf8')
  assert.match(route, /x-itmounts-evaluator-profile/)
  assert.match(route, /COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE/)
  assert.match(route, /verifyIndependentEvaluatorPayload/)
  assert.match(route, /recordIndependentEvaluatorEvidence/)
  assert.doesNotMatch(route, /requireOwner/)
  assert.doesNotMatch(route, /TRAINING_EXECUTOR/)
  assert.doesNotMatch(route, /HF_TOKEN/)
  assert.doesNotMatch(route, /fetch\(/)
})

test('database already admits independent_scorer as a distinct verifier authority', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260911022000_cos_university_training_executor_verifier.sql', import.meta.url), 'utf8')
  assert.match(migration, /'independent_scorer'/)
  assert.match(migration, /'training_executor'/)
  assert.notEqual(COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE, 'cos_university_training_executor_v1')
})