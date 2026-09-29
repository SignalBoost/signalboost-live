// saas/tests/reasoningSkillRemediation.node.test.ts
//
// Production 2026-09-28, 474 exams in 7 days: students LOST survivorship-bias reasoning in 197 exams, regression to
// the mean in 188 and the coverage denominator in 123, while gaining base-rate reasoning in 418. That alone failed
// Transfer and Retention for most students. Remediation used to answer a Transfer/Retention failure with one generic
// sentence set in unrelated software chores. It now teaches the SKILL the per-question evidence shows was lost, plus
// a rotating general-reasoning refresher - in new situations, never the exam's own wording. The exam is unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  FAILURE_DERIVED_REMEDIATION_PROFILE,
  REASONING_REFRESHER_SKILLS,
  REASONING_SKILL_BY_EVALUATION_CASE,
  failureDerivedPracticeVariant,
  failureDerivedRemediationPrinciples,
  reasoningSkillPrinciple,
  reasoningSkillsForLostCases,
  type ReasoningSkill,
} from '../lib/ai/cos/cosUniversityHybridDistillation.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('lost exam questions map to general-reasoning skills, de-duplicated, unknown ids ignored', () => {
  assert.deepEqual([...reasoningSkillsForLostCases([
    'transfer-survivorship', 'transfer-regression-mean', 'transfer-survivorship', 'retention-coverage-denominator', 'safety-secret-partial', '',
  ])], ['survivorship_bias', 'regression_to_mean', 'coverage_denominator'])
  assert.deepEqual([...reasoningSkillsForLostCases([])], [])
  // Every fixed transfer/retention question in the evaluator has a skill.
  const evaluator = read('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  const fixedIds = [...evaluator.matchAll(/\{id:'((?:transfer|retention)-[a-z-]+)'/g)].map(match => match[1])
  assert.ok(fixedIds.length >= 8)
  const retired = new Set(['retention-attribution-discriminating', 'retention-ev-asymmetric'])
  for (const id of fixedIds.filter(id => !retired.has(id))) assert.ok(REASONING_SKILL_BY_EVALUATION_CASE[id], `${id} has no skill`)
})

const cohort = (gates: any[], lostSkills: ReasoningSkill[], candidateId = 'mass:student-1') =>
  Array.from({ length: 20 }, (_, ordinal) => failureDerivedPracticeVariant({
    subjectId: 'Quantum Computing', candidateId, ordinal, gates, lostSkills,
  }))

test('a Transfer failure teaches the lost skills three times in four, and a rotating refresher every fourth', () => {
  const variants = cohort(['unseen_transfer'], ['survivorship_bias', 'regression_to_mean'])
  assert.ok(variants.every(item => item.focus === 'reasoning_skill'))
  const targeted = variants.filter(item => !item.reasoningRefresher)
  const refresher = variants.filter(item => item.reasoningRefresher)
  assert.equal(targeted.length, 15)
  assert.equal(refresher.length, 5)
  assert.equal(targeted.filter(item => item.reasoningSkill === 'survivorship_bias').length, 8)
  assert.equal(targeted.filter(item => item.reasoningSkill === 'regression_to_mean').length, 7)
  assert.ok(refresher.every(item => REASONING_REFRESHER_SKILLS.includes(item.reasoningSkill!)))
  for (const item of variants) {
    assert.ok(item.remediationRequirements.some(line => line.includes(reasoningSkillPrinciple(item.reasoningSkill!))))
    assert.ok(item.remediationRequirements.some(line => line.includes('in Quantum Computing')))
  }
})

test('with no per-question evidence, a Transfer/Retention failure still gets general-reasoning practice', () => {
  const variants = cohort(['delayed_retention'], [])
  assert.ok(variants.every(item => item.focus === 'reasoning_skill' && item.reasoningRefresher === true))
  assert.equal(new Set(variants.map(item => item.reasoningSkill)).size, REASONING_REFRESHER_SKILLS.length)
})

test('safety and holdout-only remediation are unchanged', () => {
  const safety = cohort(['safety', 'unseen_transfer'], ['survivorship_bias'])
  assert.ok(safety.every(item => ['authority_boundary', 'causal_attribution', 'credential_containment'].includes(item.focus)))
  const holdout = cohort(['holdout_improvement'], [])
  assert.ok(holdout.every(item => item.focus === 'general' && item.reasoningSkill === undefined))
})

test('principles name the lost skills and keep general reasoning in view', () => {
  const principles = failureDerivedRemediationPrinciples(['unseen_transfer'], ['survivorship_bias', 'coverage_denominator']).join(' ')
  assert.match(principles, /survivorship bias/)
  assert.match(principles, /coverage denominator/)
  assert.match(principles, /Keep general reasoning intact while learning the subject/)
  assert.doesNotMatch(failureDerivedRemediationPrinciples(['holdout_improvement']).join(' '), /Keep general reasoning intact/)
})

test('no remediation text reuses the exam questions', () => {
  const text = [
    ...REASONING_REFRESHER_SKILLS.map(skill => reasoningSkillPrinciple(skill)),
    ...cohort(['unseen_transfer', 'delayed_retention'], [...REASONING_REFRESHER_SKILLS]).flatMap(item =>
      [item.context, item.verificationMode, item.difficultyTwist, ...item.remediationRequirements]),
  ].join(' ').toLowerCase()
  // Distinctive wording, figures and scenarios from the fixed transfer/retention questions.
  for (const phrase of [
    'framework', 'ten worst regions', 'treatment a', '95% sensitive', '1% of items', 'dashboard', '30 days',
    '10% of requests', '3 of 5', '400 of 1,000', 'incidents down to 12', '18%', 'redesign', '70% likely', 'three times more probable',
    'defective', 'vendor', 'checkout', 'promotion', 'still running', 'rises or falls',
  ]) assert.ok(!text.includes(phrase), `remediation text contains exam wording: ${phrase}`)
})

test('the installer reads only case ids and scores, and re-remediates failures covered by the older profile', () => {
  assert.equal(FAILURE_DERIVED_REMEDIATION_PROFILE, 'cos-university-failure-derived-remediation-v4')
  const installer = read('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.match(installer, /\.select\('run_key,candidate_id,subject_id,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,created_at'\)/)
  assert.match(installer, /from\('cos_university_distilled_evaluation_cases'\)\s*\n\s*\.select\('run_key,case_id,baseline_score,candidate_score'\)/)
  assert.match(installer, /\.in\('suite', \['transfer', 'retention'\]\)/)
  assert.match(installer, /if \(String\(item\?\.remediationProfile \|\| ''\) !== FAILURE_DERIVED_REMEDIATION_PROFILE\) continue/)
  assert.match(installer, /failureDerivedRemediationPrinciples\(failure\.gates, failure\.lostSkills\)/)
  assert.match(installer, /lostSkills: failure\.lostSkills,/)
  // The existing leakage guard stays in every seed.
  assert.match(installer, /Use those general principles without recreating any hidden evaluation case/)
})
