// saas/tests/cosUniversityMassGraduateRegistration.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideMassGraduateRegistration, type MassGraduateArtifact, type MassGraduateEvent } from '../lib/ai/cos/cosUniversityMassGraduateRegistration.ts'
import { assessHoldoutGain } from '../lib/ai/cos/cosUniversityHoldoutGainSignificance.ts'

const hash = 'c'.repeat(64)
const artifact: MassGraduateArtifact = {
  candidateId: 'mass:481a6760', subjectId: 'computer_science', studentModelId: 'Qwen/Qwen3-4B',
  trainedArtifactId: 'cadomos/itmounts-mass-distilled', trainedArtifactHash: hash,
  rollbackArtifactRef: 'hf://models/cadomos/base@abc', status: 'runtime_pending', createdAt: '2026-09-14T21:24:00.000Z',
}
const event = (claim: string, verifier: string, extra: Record<string, unknown> = {}): MassGraduateEvent =>
  ({ candidateId: artifact.candidateId, verifier, evidence: { claim, artifactHash: hash, ...extra } })
// The exam that produced the verdict, with the significance the evaluator records since 2026-10-06.
const exam = (baselineScore: number, trainedArtifactScore: number, significance: Record<string, unknown> | null) =>
  event('mass_distilled_independent_evaluation_completed', 'host_controller', {
    evaluationPassed: true,
    holdout: { baselineScore, trainedArtifactScore, improved: true, ...(significance ? { significance } : {}) },
  })
const significant = assessHoldoutGain([0, 1, 2, 3, 4, 5].map(() => ({ baseline: 0, candidate: 1 })))
// Every existing fixture carries the exam that produced its verdict, with a significant recorded gain, so the gates
// below are tested exactly as before; the significance gate itself has its own tests further down.
const verdict = (baselineScore: number, trainedArtifactScore: number) => [
  event('independent_evaluation', 'independent_scorer', { baselineScore, trainedArtifactScore }),
  exam(baselineScore, trainedArtifactScore, significant),
]
const canary = () => event('production_canary_healthy', 'host_production_verifier', { exactArtifact: true, productionTrafficAuthorized: false })
const passes = () => [event('safety_regression_passed', 'host_controller'), event('unseen_transfer_passed', 'host_controller'), event('delayed_retention_passed', 'host_controller')]

test('the first artifact that beat its baseline and passed every gate is registered', () => {
  // mass:481a6760, 2026-09-17 20:36 UTC: holdout 0.925 against a 0.875 baseline.
  const decision = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [...verdict(0.875, 0.925), canary(), ...passes()] })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:481a6760')
  assert.equal(decision.baselineScore, 0.875)
  assert.equal(decision.trainedArtifactScore, 0.925)
})

test('a tie or a regression never graduates', () => {
  for (const [baseline, trained] of [[0.9, 0.9], [0.683, 0.55]] as const) {
    const decision = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [...verdict(baseline, trained), canary(), ...passes()] })
    assert.deepEqual(decision, { register: false, reason: 'holdout_not_improved' })
  }
})

test('every gate is required: verdict, assurance claims, exact-artifact canary, rollback reference', () => {
  const cases: ReadonlyArray<readonly [MassGraduateEvent[], MassGraduateArtifact, string]> = [
    [[canary(), ...passes()], artifact, 'independent_verdict_missing'],
    [[...verdict(0.875, 0.925), canary(), passes()[0]], artifact, 'assurance_claims_incomplete'],
    [[...verdict(0.875, 0.925), ...passes()], artifact, 'exact_artifact_canary_missing'],
    [[...verdict(0.875, 0.925), canary(), ...passes()], { ...artifact, rollbackArtifactRef: null }, 'rollback_reference_missing'],
  ]
  for (const [events, subject, reason] of cases) {
    assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [subject], events }), { register: false, reason })
  }
})

test('artifacts still under evaluation, and the kill switch, are respected', () => {
  const evaluating = { ...artifact, status: 'evaluation_pending' }
  assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [evaluating], events: [...verdict(0.875, 0.925), canary(), ...passes()] }),
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


test('graduate cron requeues a passed reopened artifact when its independent verdict is stale', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-graduate-activation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /mass_graduate_stale_reopened_verdict_recovery_2026-09-30/)
  assert.match(route, /row\.evidence\?\.claim === 'mass_distilled_independent_evaluation_completed'/)
  assert.match(route, /row\.evidence\?\.evaluationPassed === true/)
  assert.match(route, /row\.evidence\?\.claim === 'independent_evaluation'/)
  assert.match(route, /Number\(row\.evidence\?\.baselineScore\) === baseline/)
  assert.match(route, /Number\(row\.evidence\?\.trainedArtifactScore\) === trained/)
  assert.match(route, /update\(\{ status: 'evaluation_pending', updated_at: now \}\)/)
  assert.match(route, /\.eq\('status', 'runtime_pending'\)/)
  assert.match(route, /claim: 'mass_distilled_independent_evaluation_reopened'/)
  assert.match(route, /authorityExpanded: false, productionTrafficAuthorized: false/)
  assert.match(route, /reason: 'stale_reopened_verdict_requeued'/)
})


test('a higher holdout mean without a recorded significant gain never graduates (owner go 2026-10-06)', () => {
  const verdictOnly = event('independent_evaluation', 'independent_scorer', { baselineScore: 0.875, trainedArtifactScore: 0.925 })
  // Passed before the significance gate existed: no significance recorded.
  assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdictOnly, exam(0.875, 0.925, null), canary(), ...passes()] }),
    { register: false, reason: 'holdout_gain_not_significant' })
  // No completed exam at all.
  assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdictOnly, canary(), ...passes()] }),
    { register: false, reason: 'holdout_gain_not_significant' })
  // Recorded, but not significant.
  const chance = assessHoldoutGain([[0.5, 1], [1, 1], [1, 1], [1, 1], [0, 0], [1, 1]].map(([baseline, candidate]) => ({ baseline, candidate })))
  assert.equal(chance.significant, false)
  assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdictOnly, exam(0.875, 0.925, chance), canary(), ...passes()] }),
    { register: false, reason: 'holdout_gain_not_significant' })
  // Significant, but recorded on a DIFFERENT exam than the verdict's scores: never borrowed.
  assert.deepEqual(decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdictOnly, exam(0.5, 1, significant), canary(), ...passes()] }),
    { register: false, reason: 'holdout_gain_not_significant' })
  // The same evidence with the significant exam that produced these scores graduates.
  const decision = decideMassGraduateRegistration({ enabled: true, artifacts: [artifact], events: [verdictOnly, exam(0.875, 0.925, significant), canary(), ...passes()] })
  assert.ok('artifact' in decision)
})

test('graduate cron reopens a pre-significance-gate pass for one re-exam instead of graduating or parking it', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-graduate-activation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const preSignificanceGatePass = Boolean\(completion\)/)
  assert.match(route, /'significance' in completedHoldout/)
  assert.match(route, /if \(!freshVerdict \|\| preSignificanceGatePass\)/)
  assert.match(route, /'mass_graduate_holdout_significance_gate_reexam_2026-10-06'/)
  // The re-exam reuses the existing governed reopen: status back to evaluation_pending, recorded, no authority.
  assert.match(route, /claim: 'mass_distilled_independent_evaluation_reopened'/)
  assert.match(route, /authorityExpanded: false, productionTrafficAuthorized: false/)
})
