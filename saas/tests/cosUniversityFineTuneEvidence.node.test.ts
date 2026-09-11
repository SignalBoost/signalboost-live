import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildFineTuneEvidenceInput, buildFineTunePartitionRevision, FINE_TUNE_CLAIM_VERIFIER, FINE_TUNE_EVIDENCE_PROFILE, fineTuneRevisionKey, foldFineTuneEvidenceRows } from '../lib/ai/cos/cosUniversityFineTuneEvidence.ts'
import { decideControlledFineTune } from '../lib/ai/cos/cosUniversityLearningAssurance.ts'

const H = 'a'.repeat(64)
const base = { baseModel: 'base', datasetHash: H, trainingManifestHash: 'b'.repeat(64), holdoutManifestHash: 'c'.repeat(64) }
const revisionKey = fineTuneRevisionKey(base)
const row = (claim: keyof typeof FINE_TUNE_CLAIM_VERIFIER, evidence: Record<string, unknown> = {}, verifier = FINE_TUNE_CLAIM_VERIFIER[claim]) => ({ evidence: { profile: FINE_TUNE_EVIDENCE_PROFILE, claim, evidenceRef: `proof:${claim}`, revisionKey, ...evidence }, verifier, observed_at: '2026-09-11T00:00:00Z' })

test('absent evidence remains fully blocked', () => {
  const decision = decideControlledFineTune(buildFineTuneEvidenceInput(base, foldFineTuneEvidenceRows([])))
  assert.equal(decision.eligibleForTraining, false); assert.equal(decision.eligibleForPromotion, false)
})

test('host approvals authorize training but cannot manufacture a trained artifact or promotion', () => {
  const recorded = foldFineTuneEvidenceRows([row('dataset_approved'), row('training_approved')])
  const decision = decideControlledFineTune(buildFineTuneEvidenceInput(base, recorded))
  assert.equal(decision.eligibleForTraining, true)
  assert.equal(decision.stage, 'training_approved')
  assert.equal(decision.eligibleForPromotion, false)
  assert.ok(decision.blockers.includes('trained_artifact_id_missing'))
})

test('wrong-verifier and evidence-free claims are ignored', () => {
  const folded = foldFineTuneEvidenceRows([row('safety_regression_passed', {}, 'host_controller'), { ...row('unseen_transfer_passed'), evidence: { profile: FINE_TUNE_EVIDENCE_PROFILE, claim: 'unseen_transfer_passed' } }])
  assert.deepEqual(folded.claims, [])
})

test('evidence from another candidate revision cannot authorize this revision', () => {
  const stale = { ...row('dataset_approved'), evidence: { ...row('dataset_approved').evidence, revisionKey: 'stale' } }
  assert.deepEqual(foldFineTuneEvidenceRows([stale], revisionKey).claims, [])
})

test('artifact and evaluation claims require concrete hashes and references', () => {
  const folded = foldFineTuneEvidenceRows([
    row('trained_artifact_registered', { trainedArtifactId: 'model-1', artifactHash: H }),
    row('independent_evaluation', { trainedArtifactId: 'model-1', artifactHash: H, baselineScore: 0.5, trainedArtifactScore: 0.7, holdoutManifestHash: base.holdoutManifestHash }),
  ], revisionKey, base.holdoutManifestHash)
  assert.equal(folded.trainedArtifactId, 'model-1'); assert.equal(folded.trainedArtifactScore, 0.7)
})

test('post-training claims cannot be mixed between artifacts or holdouts', () => {
  const folded = foldFineTuneEvidenceRows([
    row('trained_artifact_registered', { trainedArtifactId: 'model-1', artifactHash: H }),
    row('independent_evaluation', { trainedArtifactId: 'model-2', artifactHash: 'd'.repeat(64), baselineScore: 0.5, trainedArtifactScore: 0.9, holdoutManifestHash: base.holdoutManifestHash }),
    row('safety_regression_passed', { trainedArtifactId: 'model-1', artifactHash: 'd'.repeat(64) }),
    row('unseen_transfer_passed', { trainedArtifactId: 'model-1', artifactHash: H }),
    row('independent_evaluation', { trainedArtifactId: 'model-1', artifactHash: H, baselineScore: 0.5, trainedArtifactScore: 0.8, holdoutManifestHash: 'e'.repeat(64) }),
  ], revisionKey, base.holdoutManifestHash)
  assert.deepEqual(folded.claims, ['trained_artifact_registered', 'unseen_transfer_passed'])
  assert.equal(folded.trainedArtifactScore, 0)
})

test('expired claims are ignored', () => {
  const expired = { ...row('dataset_approved'), expires_at: '2026-09-10T00:00:00Z' }
  assert.deepEqual(foldFineTuneEvidenceRows([expired], revisionKey, base.holdoutManifestHash, new Date('2026-09-11T00:00:00Z')).claims, [])
})

test('future-dated claims are ignored', () => {
  const future = { ...row('dataset_approved'), observed_at: '2026-09-12T00:00:00Z' }
  assert.deepEqual(foldFineTuneEvidenceRows([future], revisionKey, base.holdoutManifestHash, new Date('2026-09-11T00:00:00Z')).claims, [])
})

test('partition revision requires real nonempty disjoint item manifests', () => {
  const valid = buildFineTunePartitionRevision({ baseModel: 'base', datasetHash: H, trainingItemHashes: ['1'.repeat(64)], holdoutItemHashes: ['2'.repeat(64)] })
  assert.ok(valid); assert.notEqual(valid.trainingManifestHash, valid.holdoutManifestHash)
  assert.equal(buildFineTunePartitionRevision({ baseModel: 'base', datasetHash: H, trainingItemHashes: [H], holdoutItemHashes: [H] }), null)
  assert.equal(buildFineTunePartitionRevision({ baseModel: 'base', datasetHash: H, trainingItemHashes: [], holdoutItemHashes: ['2'.repeat(64)] }), null)
})

test('owner HTTP route cannot manufacture independent, canary, artifact, or rollback proof', () => {
  const route = readFileSync('app/api/admin/cos-university-assurance/route.ts', 'utf8')
  assert.match(route, /requireOwner\(\)/); assert.match(route, /dataset_approved.*training_approved/)
  assert.doesNotMatch(route, /independent_evaluation.*safety_regression_passed/)
  assert.match(route, /host_claim_not_permitted/)
})

test('runner reads durable evidence instead of hard-coded passing values', () => {
  const runner = readFileSync('lib/ai/cos/cosUniversityControlledFineTuning.ts', 'utf8')
  assert.match(runner, /readFineTuneEvidence\(candidateId, revision, now\)/)
  assert.doesNotMatch(runner, /datasetApprovedByHost:\s*true/)
  assert.match(runner, /readFineTunePartitionRevision\(candidateId, datasetHash, now\)/)
  assert.doesNotMatch(runner, /partition:\s*'training'/)
  assert.match(runner, /claim:\s*'candidate_status_observed'/)
  assert.match(runner, /lifecycleStage:\s*decision\.stage/)
  assert.doesNotMatch(runner, /candidate_packaged_not_trained/)
})

test('database admits the training executor verifier', () => {
  const migration = readFileSync('supabase/migrations/20260911022000_cos_university_training_executor_verifier.sql', 'utf8')
  assert.match(migration, /training_executor/)
})
