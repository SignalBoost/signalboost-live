import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND,
  buildCosUniversityDeliberatePracticeVariants,
  cosUniversityPracticeSkillKey,
} from '../lib/ai/cos/cosUniversityDeliberatePractice.ts'
import { cosUniversityPlanEligibleForContinuousStudy } from '../lib/ai/cos/cosUniversityContinuousCadence.ts'

function file(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
}

const basePlan = {
  planKey: 'a'.repeat(64),
  subjectId: 'computer_science' as const,
  language: null,
  failureClass: 'evidence_selection' as const,
  objective: 'Select material evidence correctly, preserve unresolved facts, and verify the next safe step.',
  practiceRound: 1,
}

test('University deliberate practice is deterministic per round but materially varied within the round', () => {
  const first = buildCosUniversityDeliberatePracticeVariants(basePlan)
  const second = buildCosUniversityDeliberatePracticeVariants(basePlan)
  assert.equal(first.length, COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND)
  assert.deepEqual(first, second)
  assert.notEqual(first[0].variantKey, first[1].variantKey)
  assert.notEqual(first[0].manifestHash, first[1].manifestHash)
  assert.notEqual(first[0].prompt, first[1].prompt)
  assert.ok(first.every(variant => !/rubric|requiredConceptGroups|minimumConceptCoverage/i.test(variant.prompt)))
})

test('a new study round creates new deliberate-practice variants instead of retrying memorized prompts', () => {
  const round1 = buildCosUniversityDeliberatePracticeVariants(basePlan)
  const round2 = buildCosUniversityDeliberatePracticeVariants({ ...basePlan, practiceRound: 2 })
  assert.notDeepEqual(round1.map(row => row.variantKey), round2.map(row => row.variantKey))
  assert.notDeepEqual(round1.map(row => row.manifestHash), round2.map(row => row.manifestHash))
})

test('practice-only cognitive skill keys are stable but distinct from University plan keys', () => {
  const key = cosUniversityPracticeSkillKey(basePlan.planKey)
  assert.match(key, /^university-practice-[0-9a-f]{32}$/)
  assert.equal(key, cosUniversityPracticeSkillKey(basePlan.planKey))
  assert.notEqual(key, basePlan.planKey)
})

test('Polish practice rubrics do not depend on English-only semantic groups', () => {
  const variants = buildCosUniversityDeliberatePracticeVariants({
    ...basePlan,
    subjectId: 'language_communication',
    language: 'pl',
    failureClass: 'language',
  })
  const polishSignals = /niezn|zwery|dowod|prosz|komunik|znaczen|instruk|odbior|ton/i
  for (const variant of variants) {
    assert.match(variant.prompt, /po polsku/i)
    for (const group of variant.rubric.requiredConceptGroups.slice(3)) {
      assert.ok(group.some(term => polishSignals.test(term)), `English-only language rubric group: ${group.join(',')}`)
    }
  }
})

test('ready-for-exam plans stop passive rereading while failed/studying plans can re-enter after cooldown', () => {
  const now = new Date('2026-09-08T03:00:00Z')
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: '1', status: 'ready_for_exam', lastAttemptAt: '2026-09-08T01:00:00Z' }, now), false)
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: '2', status: 'studying', lastAttemptAt: '2026-09-08T01:00:00Z' }, now), true)
  assert.equal(cosUniversityPlanEligibleForContinuousStudy({ id: '3', status: 'studying', lastAttemptAt: '2026-09-08T02:30:00Z' }, now), false)
})

test('runtime reuses cognitive practice evidence but cannot award an academic grade', () => {
  const runner = file('lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  assert.match(runner, /cos_active_practice_queue/)
  assert.match(runner, /cos_record_cognitive_practice_result/)
  assert.match(runner, /academicCredit: false/)
  assert.match(runner, /callCosReasoner/)
  assert.match(runner, /parseLocalResult/)
  assert.match(runner, /externalEscalationAllowed: false/)
  assert.match(runner, /responseSource: 'cos_local_reasoner'/)
  assert.match(runner, /status: ready \? 'ready_for_exam' : 'studying'/)
  assert.doesNotMatch(runner, /tryCOSFirstAnswer/)
  assert.doesNotMatch(runner, /recordCosUniversityAssessment/)
  assert.doesNotMatch(runner, /from\(['"]cos_university_assessments['"]\)/)
})

test('practice uses a training-specific local reasoning seam rather than the owner advisory release pipeline', () => {
  const runner = file('lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  assert.match(runner, /This is training, not an owner-facing advisory answer/)
  assert.match(runner, /Return strict JSON only/)
  assert.doesNotMatch(runner, /SignalBoost's independent PRIMARY reasoning layer/)
  assert.doesNotMatch(runner, /cosFirstAnswerEnterprise/)
})

test('practice route is isolated from the learner and scheduled after continuous acquisition', () => {
  const route = file('app/api/cron/cos-university-practice/route.ts')
  const vercel = file('vercel.json')
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /Unauthorized/)
  assert.match(route, /maxExercises: 2/)
  assert.match(vercel, /COS_UNIVERSITY_PRACTICE_ENABLED/)
  assert.match(vercel, /cos-university-learning[^\n]+\*\/15/)
  assert.match(vercel, /cos-university-practice[^\n]+5,20,35,50/)
})

test('deliberate-practice regression is part of the mandatory COS deployment gate', () => {
  const gate = file('scripts/vercel-cos-gates.mjs')
  assert.match(gate, /cosUniversityDeliberatePractice\.node\.test\.ts/)
})
