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
import { selectEligibleCosUniversityPracticePlans } from '../lib/ai/cos/cosUniversityPracticeSelection.ts'

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

test('Language & Communication practice rehearses fact-preserving audience rewrites before independent retest', () => {
  const variants = buildCosUniversityDeliberatePracticeVariants({
    ...basePlan,
    subjectId: 'language_communication',
    failureClass: 'unknown',
    objective: 'Improve executive and customer communication while preserving supplied facts and uncertainty.',
  })

  assert.equal(variants.length, COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND)
  for (const variant of variants) {
    assert.match(variant.prompt, /Rewrite this source packet/i)
    assert.match(variant.prompt, /Preserve every supplied fact and exact quantity/i)
    assert.match(variant.prompt, /preserve the unresolved status/i)
    assert.doesNotMatch(variant.prompt, /Diagnose the case/i)
    assert.equal(variant.rubric.minimumConceptCoverage, 1)
    const numericGroups = variant.rubric.requiredConceptGroups.filter(group => group.length === 1 && /^\d+$/.test(group[0]))
    assert.equal(numericGroups.length, 2)
    assert.ok(variant.rubric.requiredConceptGroups.some(group => group.includes('release record')))
    assert.ok(variant.rubric.requiredConceptGroups.some(group => group.includes('health')))
  }
})

test('History, Culture, Philosophy & Religion practice uses genuine humanities evidence cases rather than generic vendor operations', () => {
  const variants = buildCosUniversityDeliberatePracticeVariants({
    ...basePlan,
    subjectId: 'history_culture_philosophy_religion',
    failureClass: 'unknown',
    objective: 'Remediate a fresh independent humanities examination through broad study and evidence analysis.',
    practiceRound: 11,
  })

  assert.equal(variants.length, COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND)
  for (const variant of variants) {
    assert.match(variant.prompt, /participant accounts/i)
    assert.match(variant.prompt, /institutional records/i)
    assert.match(variant.prompt, /historical evidence/i)
    assert.match(variant.prompt, /cultural context/i)
    assert.match(variant.prompt, /ethical interpretation/i)
    assert.match(variant.prompt, /additional corroboration/i)
    assert.doesNotMatch(variant.prompt, /evaluating a vendor|support resolved|pre-release checks/i)
    assert.equal(variant.rubric.minimumConceptCoverage, 0.68)
    assert.equal(variant.rubric.minimumAnswerCharacters, 260)
    assert.ok(variant.rubric.requiredConceptGroups.some(group => group.includes('historical')))
    assert.ok(variant.rubric.requiredConceptGroups.some(group => group.includes('ethical')))
    assert.ok(variant.rubric.requiredConceptGroups.some(group => group.includes('uncertainty')))
  }
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
  assert.match(runner, /responseSource: execution\.responseSource/)
  assert.match(runner, /executionProvenance: execution\.executionProvenance/)
  assert.match(file('lib/ai/cos/cosUniversityPracticeExecution.ts'), /responseSource: 'cos_local_reasoner'/)
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

test('practice selection skips a blocked first plan without excluding the next eligible plan', async () => {
  const plans = [
    { id: 'portuguese-restudy', allowed: false },
    { id: 'polish-accepted-study', allowed: true },
  ]
  const selected = await selectEligibleCosUniversityPracticePlans(plans, 1, async plan => plan.allowed)
  assert.deepEqual(selected.map(plan => plan.id), ['polish-accepted-study'])
})

test('practice selection counts eligible plans, preserves priority, and stops at the host limit', async () => {
  const checked: string[] = []
  const plans = [
    { id: 'first', allowed: true },
    { id: 'blocked', allowed: false },
    { id: 'second', allowed: true },
    { id: 'outside-budget', allowed: true },
  ]
  const selected = await selectEligibleCosUniversityPracticePlans(plans, 2, async plan => {
    checked.push(plan.id)
    return plan.allowed
  })
  assert.deepEqual(selected.map(plan => plan.id), ['first', 'second'])
  assert.deepEqual(checked, ['first', 'blocked', 'second'])
})

test('practice selection never promotes blocked plans or changes their study evidence', async () => {
  const plans = [Object.freeze({ id: 'needs-restudy', requiresNewStudyAttempt: true })]
  const before = JSON.stringify(plans)
  const selected = await selectEligibleCosUniversityPracticePlans(Object.freeze(plans), 1, async () => false)
  assert.deepEqual(selected, [])
  assert.equal(JSON.stringify(plans), before)
  assert.deepEqual(await selectEligibleCosUniversityPracticePlans([], 1, async () => true), [])
})

test('practice selection fails closed when an eligibility check throws', async () => {
  await assert.rejects(
    selectEligibleCosUniversityPracticePlans([{ id: 'unverified' }], 1, async () => {
      throw new Error('study_database_unavailable')
    }),
    /study_database_unavailable/,
  )
})

test('practice selection rejects invalid limits without invoking eligibility checks', async () => {
  for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const selected = await selectEligibleCosUniversityPracticePlans([{}], limit, async () => {
      assert.fail('invalid limits must not invoke the eligibility checker')
    })
    assert.deepEqual(selected, [])
  }
})

test('practice selection runtime preserves bounded agent-scoped reads and the existing study fence', () => {
  const runner = file('lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  const start = runner.indexOf('async function loadStudyPlans(')
  const end = runner.indexOf('\nfunction universityProcedure(', start)
  assert.ok(start >= 0 && end > start)
  const loader = runner.slice(start, end)
  assert.match(loader, /\.eq\('agent_id', agentId\)/)
  assert.match(loader, /\.limit\(Math\.max\(1, Math\.min\(20, limit \* 4\)\)\)/)
  assert.match(loader, /return selectEligibleCosUniversityPracticePlans\(candidates, limit, async plan =>/)
  assert.match(loader, /return practiceFenceStillValid\(agentId, plan\.id, round\)/)
  assert.match(loader, /practiceFenceStillValid\(agentId, plan\.id, Math\.floor\(requiredRound\)\)/)
  assert.doesNotMatch(loader, /\.slice\(0, limit\)/)
})

// Bound-executor regressions run with the existing mandatory practice deployment gate.
import './cosUniversityBoundPractice.node.test.ts'
