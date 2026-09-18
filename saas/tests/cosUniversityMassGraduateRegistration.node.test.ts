// saas/tests/cosUniversityMassGraduateRegistration.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideMassGraduateRegistration, type MassGraduateArtifact, type MassGraduateEvent } from '../lib/ai/cos/cosUniversityMassGraduateRegistration.ts'

const hash = 'c'.repeat(64)
const artifact: MassGraduateArtifact = {
  candidateId: 'mass:481a6760', subjectId: 'computer_science', studentModelId: 'Qwen/Qwen3-4B',
  trainedArtifactId: 'cadomos/itmounts-mass-distilled', trainedArtifactHash: hash,
  rollbackArtifactRef: 'hf://models/cadomos/base@abc', status: 'runtime_pending', createdAt: '2026-09-14T21:24:00.000Z',
}
const event = (claim: string, verifier: string, extra: Record<string, unknown> = {}): MassGraduateEvent =>
  ({ candidateId: artifact.candidateId, verifier, evidence: { claim, artifactHash: hash, ...extra } })
const verdict = (baselineScore: number, trainedArtifactScore: number) =>
  event('independent_evaluation', 'independent_scorer', { baselineScore, trainedArtifactScore })
const canary = () => event('production_canary_healthy', 'host_production_verifier', { exactArtifact: true, productionTrafficAuthorized: false })
const passes = () => [event('safety_regression_passed', 'host_controller'), event('unseen_transfer_passed', 'host_controller'), event('delayed_retention_passed', 'host_controller')]

test('the first artifact that beat its baseline and passed every gate is registered', () => {
  // mass:481a6760, 2026-09-17 20:36 UTC: holdout 0.925 against a 0.875 baseline.
  const decision = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdict(0.875, 0.925), canary(), ...passes()] })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:481a6760')
  assert.equal(decision.baselineScore, 0.875)
  assert.equal(decision.trainedArtifactScore, 0.925)
})

test('a tie or a regression never graduates', () => {
  for (const [baseline, trained] of [[0.9, 0.9], [0.683, 0.55]] as const) {
    const decision = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdict(baseline, trained), canary(), ...passes()] })
    assert.deepEqual(decision, { register: false, reason: 'holdout_not_improved' })
  }
})

test('every gate is required: verdict, assurance claims, exact-artifact canary, rollback reference', () => {
  const cases: ReadonlyArray<readonly [MassGraduateEvent[], MassGraduateArtifact, string]> = [
    [[canary(), ...passes()], artifact, 'independent_verdict_missing'],
    [[verdict(0.875, 0.925), canary(), passes()[0]], artifact, 'assurance_claims_incomplete'],
    [[verdict(0.875, 0.925), ...passes()], artifact, 'exact_artifact_canary_missing'],
    [[verdict(0.875, 0.925), canary(), ...passes()], { ...artifact, rollbackArtifactRef: null }, 'rollback_reference_missing'],
  ]
  for (const [events, subject, reason] of cases) {
    assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [subject], events }), { register: false, reason })
  }
})

test('artifacts still under evaluation, and the kill switch, are respected', () => {
  const evaluating = { ...artifact, status: 'evaluation_pending' }
  assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [evaluating], events: [verdict(0.875, 0.925), canary(), ...passes()] }),
    { register: false, reason: 'no_mass_artifact_eligible_for_graduation' })
  assert.deepEqual(decideMassGraduateRegistration({ enabled: false, artifacts: [artifact], events: [] }),
    { register: false, reason: 'mass_graduate_registration_disabled' })
})

test('registration runs before the activation flag, spends nothing and authorizes no traffic', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-graduate-activation/route.ts', import.meta.url), 'utf8')
  const registerAt = route.indexOf('const massRegistration = await registerNextMassGraduate()')
  const flagAt = route.indexOf("process.env[ACTIVATION_ENABLED_FLAG]")
  const activateAt = route.indexOf('await activateGraduateRuntime({')
  assert.ok(registerAt > 0 && flagAt > registerAt && activateAt > flagAt)
  assert.match(route, /eligibleForPromotion: true,\n\s+authorityExpanded: false,/)
  assert.match(route, /productionTrafficAuthorized: false/)
  assert.match(route, /COS_MASS_GRADUATE_REGISTRATION/)
  assert.doesNotMatch(route, /status: 'active'/)
})
