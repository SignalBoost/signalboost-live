import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  AUTOPSY_HOLDOUT_SUCCESSES,
  AUTOPSY_PRACTICE_SUCCESSES,
  AUTOPSY_TOTAL_CLEAN_RETESTS,
  deriveAutopsySkillCandidates,
  type AutopsyPromotionRow,
} from '../lib/ai/cos/failureAutopsyPromotionPolicy.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

function row(index: number, passed = true, problemClass = 'incident diagnosis', retestCaseId = `case-${index}`): AutopsyPromotionRow {
  return {
    id: `a-${index}`,
    problem_class: problemClass,
    primary_stage: 'reasoning',
    corrective_guidance: 'Compare candidate explanations against the supplied facts and state concrete falsifiers.',
    falsifier: 'A separate comparable case still fails after the procedure is applied.',
    retest_case_id: retestCaseId,
    retest_passed: passed,
    lesson_retained: passed,
    status: passed ? 'retest_passed' : 'retest_failed',
    updated_at: new Date(Date.UTC(2026, 7, 20, index)).toISOString(),
  }
}

test('autopsy promotion requires the full practice plus independent holdout evidence budget', () => {
  assert.equal(AUTOPSY_PRACTICE_SUCCESSES, 2)
  assert.equal(AUTOPSY_HOLDOUT_SUCCESSES, 3)
  assert.equal(AUTOPSY_TOTAL_CLEAN_RETESTS, 5)
  const candidate = deriveAutopsySkillCandidates(Array.from({ length: 4 }, (_, i) => row(i)))[0]
  assert.equal(candidate.successRows.length, 4)
  assert.equal(candidate.failureRows.length, 0)
  assert.ok(candidate.skillKey.startsWith('reasoning.failure_autopsy.'))
})

test('five clean independent retests form one exact problem-class/stage cohort', () => {
  const candidate = deriveAutopsySkillCandidates(Array.from({ length: 5 }, (_, i) => row(i)))[0]
  assert.equal(candidate.successRows.length, 5)
  assert.equal(new Set(candidate.successRows.map(item => item.retest_case_id)).size, 5)
  assert.equal(candidate.problemClass, 'incident diagnosis')
  assert.equal(candidate.stage, 'reasoning')
})

test('duplicate controlled retest cases count only once toward promotion', () => {
  const candidate = deriveAutopsySkillCandidates([
    row(0), row(1), row(2), row(3), row(4),
    row(8, true, 'incident diagnosis', 'case-4'),
    row(9, true, 'incident diagnosis', 'case-4'),
  ])[0]
  assert.equal(candidate.successRows.length, 5)
  assert.equal(new Set(candidate.successRows.map(item => item.retest_case_id)).size, 5)
})

test('any failed retest remains attached to the exact cohort so runtime reconciliation can weaken it', () => {
  const candidate = deriveAutopsySkillCandidates([
    ...Array.from({ length: 5 }, (_, i) => row(i)),
    row(7, false),
  ])[0]
  assert.equal(candidate.successRows.length, 5)
  assert.equal(candidate.failureRows.length, 1)
})

test('different problem classes never share promotion evidence', () => {
  const candidates = deriveAutopsySkillCandidates([
    ...Array.from({ length: 3 }, (_, i) => row(i, true, 'incident diagnosis')),
    ...Array.from({ length: 3 }, (_, i) => row(i + 4, true, 'database performance')),
  ])
  assert.equal(candidates.length, 2)
  assert.notEqual(candidates[0].skillKey, candidates[1].skillKey)
})

test('runtime promotion writes only generic procedural guidance and supports automatic weakening rollback', () => {
  const source = file('../lib/ai/cos/failureAutopsyPromotion.ts')
  assert.match(source, /status: 'validated'/)
  assert.match(source, /practice_attempts: AUTOPSY_PRACTICE_SUCCESSES/)
  assert.match(source, /holdout_attempts: AUTOPSY_HOLDOUT_SUCCESSES/)
  assert.match(source, /weakened_at: now/)
  assert.match(source, /original_prompt_stored: false/)
  assert.match(source, /Do not use benchmark fixture wording as factual evidence/)
})
