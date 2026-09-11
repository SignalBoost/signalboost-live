import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildFineTuneEvidenceInput, FINE_TUNE_CLAIM_VERIFIER, FINE_TUNE_EVIDENCE_PROFILE, foldFineTuneEvidenceRows } from '../lib/ai/cos/cosUniversityFineTuneEvidence.ts'
import { decideControlledFineTune } from '../lib/ai/cos/cosUniversityLearningAssurance.ts'

const H = 'a'.repeat(64)
const base = { baseModel: 'base', datasetHash: H, trainingManifestHash: 'b'.repeat(64), holdoutManifestHash: 'c'.repeat(64) }
const row = (claim: keyof typeof FINE_TUNE_CLAIM_VERIFIER, evidence: Record<string, unknown> = {}, verifier = FINE_TUNE_CLAIM_VERIFIER[claim]) => ({ evidence: { profile: FINE_TUNE_EVIDENCE_PROFILE, claim, evidenceRef: `proof:${claim}`, ...evidence }, verifier, observed_at: '2026-09-11T00:00:00Z' })

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

test('artifact and evaluation claims require concrete hashes and references', () => {
  const folded = foldFineTuneEvidenceRows([
    row('trained_artifact_registered', { trainedArtifactId: 'model-1', artifactHash: H }),
    row('independent_evaluation', { baselineScore: 0.5, trainedArtifactScore: 0.7, holdoutManifestHash: H }),
  ])
  assert.equal(folded.trainedArtifactId, 'model-1'); assert.equal(folded.trainedArtifactScore, 0.7)
})

test('owner HTTP route cannot manufacture independent, canary, artifact, or rollback proof', () => {
  const route = readFileSync('app/api/admin/cos-university-assurance/route.ts', 'utf8')
  assert.match(route, /requireOwner\(\)/); assert.match(route, /dataset_approved.*training_approved/)
  assert.doesNotMatch(route, /independent_evaluation.*safety_regression_passed/)
  assert.match(route, /host_claim_not_permitted/)
})

test('runner reads durable evidence instead of hard-coded passing values', () => {
  const runner = readFileSync('lib/ai/cos/cosUniversityControlledFineTuning.ts', 'utf8')
  assert.match(runner, /readFineTuneEvidence\(candidateId\)/)
  assert.doesNotMatch(runner, /datasetApprovedByHost:\s*true/)
})
