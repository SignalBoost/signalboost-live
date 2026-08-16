// saas/tests/cognitiveHeldOutCertification.node.test.ts
//
// Pins the item-4 certification thresholds: a skill isn't "independent" off one lucky holdout pass.
// It needs enough attempts, enough distinct variants, evaluator+understanding approval, no
// quarantine, and a pass rate at/above target. Uses the exact counters cos_cognitive_skills already
// maintains, so no fixture drifts from the real schema.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeHeldOutCertification,
  DEFAULT_TARGET_INDEPENDENT_PASS_RATE,
  MIN_HOLDOUT_ATTEMPTS_FOR_CERTIFICATION,
  MIN_DISTINCT_HOLDOUT_VARIANTS_FOR_CERTIFICATION,
  type SkillHoldoutRow,
} from '../lib/ai/cos/cognitiveHeldOutCertification.ts'

function skill(overrides: Partial<SkillHoldoutRow> = {}): SkillHoldoutRow {
  return {
    skillKey: 'test_skill',
    subject: 'sre',
    status: 'validated',
    evaluatorApproved: true,
    understandingApproved: true,
    holdoutAttempts: 0,
    holdoutSuccesses: 0,
    distinctHoldoutVariants: 0,
    quarantinedAt: null,
    lastValidatedAt: null,
    ...overrides,
  }
}

test('a skill with zero holdout attempts is uncertified for no_holdout_coverage', () => {
  const report = computeHeldOutCertification([skill()])
  assert.equal(report.skills[0]!.certified, false)
  assert.equal(report.skills[0]!.reason, 'no_holdout_coverage')
  assert.equal(report.skillsWithHoldoutCoverage, 0)
})

test('a single lucky pass is not enough attempts to certify', () => {
  const report = computeHeldOutCertification([skill({ holdoutAttempts: 1, holdoutSuccesses: 1, distinctHoldoutVariants: 1 })])
  assert.equal(report.skills[0]!.certified, false)
  assert.equal(report.skills[0]!.reason, 'insufficient_holdout_attempts')
})

test('enough attempts but only one distinct variant is not enough', () => {
  const report = computeHeldOutCertification([skill({
    holdoutAttempts: MIN_HOLDOUT_ATTEMPTS_FOR_CERTIFICATION, holdoutSuccesses: MIN_HOLDOUT_ATTEMPTS_FOR_CERTIFICATION, distinctHoldoutVariants: 1,
  })])
  assert.equal(report.skills[0]!.certified, false)
  assert.equal(report.skills[0]!.reason, 'insufficient_distinct_variants')
})

test('below target pass rate blocks certification even with enough coverage', () => {
  const report = computeHeldOutCertification([skill({
    holdoutAttempts: 10, holdoutSuccesses: 7, distinctHoldoutVariants: 4,
  })])
  assert.equal(report.skills[0]!.passRate, 0.7)
  assert.ok(0.7 < DEFAULT_TARGET_INDEPENDENT_PASS_RATE)
  assert.equal(report.skills[0]!.certified, false)
  assert.equal(report.skills[0]!.reason, 'below_target_pass_rate')
})

test('a fully evidenced skill at or above target certifies', () => {
  const report = computeHeldOutCertification([skill({
    holdoutAttempts: 10, holdoutSuccesses: 9, distinctHoldoutVariants: 4,
  })])
  assert.equal(report.skills[0]!.certified, true)
  assert.equal(report.skills[0]!.reason, 'certified')
  assert.equal(report.skillsCertified, 1)
  assert.equal(report.meetsTarget, true)
})

test('quarantine overrides otherwise-passing evidence', () => {
  const report = computeHeldOutCertification([skill({
    holdoutAttempts: 10, holdoutSuccesses: 10, distinctHoldoutVariants: 5, quarantinedAt: '2026-08-01T00:00:00Z',
  })])
  assert.equal(report.skills[0]!.certified, false)
  assert.equal(report.skills[0]!.reason, 'quarantined')
})

test('missing evaluator or understanding approval blocks certification before pass-rate is even checked', () => {
  const noEvaluator = computeHeldOutCertification([skill({ evaluatorApproved: false, holdoutAttempts: 10, holdoutSuccesses: 10, distinctHoldoutVariants: 5 })])
  assert.equal(noEvaluator.skills[0]!.reason, 'evaluator_not_approved')
  const noUnderstanding = computeHeldOutCertification([skill({ understandingApproved: false, holdoutAttempts: 10, holdoutSuccesses: 10, distinctHoldoutVariants: 5 })])
  assert.equal(noUnderstanding.skills[0]!.reason, 'understanding_not_approved')
})

test('bySubject aggregates and sorts ascending by pass rate so the weakest subject leads', () => {
  const report = computeHeldOutCertification([
    skill({ skillKey: 'a', subject: 'sre', holdoutAttempts: 10, holdoutSuccesses: 9, distinctHoldoutVariants: 4 }),
    skill({ skillKey: 'b', subject: 'sales', holdoutAttempts: 10, holdoutSuccesses: 3, distinctHoldoutVariants: 4 }),
  ])
  assert.equal(report.bySubject[0]!.subject, 'sales')
  assert.equal(report.bySubject[0]!.passRate, 0.3)
  assert.equal(report.bySubject[1]!.subject, 'sre')
})

test('overallPassRate and meetsTarget aggregate across skills, not per-skill certified flags', () => {
  const report = computeHeldOutCertification([
    skill({ skillKey: 'a', holdoutAttempts: 10, holdoutSuccesses: 9, distinctHoldoutVariants: 4 }),
    skill({ skillKey: 'b', holdoutAttempts: 10, holdoutSuccesses: 1, distinctHoldoutVariants: 4 }),
  ])
  assert.equal(report.overallHoldoutAttempts, 20)
  assert.equal(report.overallHoldoutSuccesses, 10)
  assert.equal(report.overallPassRate, 0.5)
  assert.equal(report.meetsTarget, false)
})

test('an empty skill set is a well-formed empty report, not a crash', () => {
  const report = computeHeldOutCertification([])
  assert.equal(report.totalSkills, 0)
  assert.equal(report.meetsTarget, false)
  assert.equal(report.bySubject.length, 0)
})
