import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  AUTOPSY_MIN_PRACTICE_ATTEMPTS,
  AUTOPSY_MIN_PRACTICE_RATE,
  autopsyPracticeReady,
  deriveAutopsySkillCandidates,
  distinctLatestRetestRows,
  type AutopsyPromotionRow,
} from '../lib/ai/cos/failureAutopsyPromotionPolicy.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

function row(index: number, passed = true, problemClass = 'incident diagnosis', caseId = `case-${index}`): AutopsyPromotionRow {
  return {
    id: `a-${index}`,
    problem_class: problemClass,
    primary_stage: 'reasoning',
    corrective_guidance: 'Compare candidate explanations against the supplied facts and state concrete falsifiers.',
    falsifier: 'A separate comparable case still fails after the procedure is applied.',
    retest_case_id: caseId,
    retest_passed: passed,
    lesson_retained: passed,
    status: passed ? 'retest_passed' : 'retest_failed',
    updated_at: new Date(Date.UTC(2026, 7, 20, index)).toISOString(),
  }
}

test('controlled autopsy evidence is only enough to establish practice readiness', () => {
  assert.equal(AUTOPSY_MIN_PRACTICE_ATTEMPTS, 2)
  assert.equal(AUTOPSY_MIN_PRACTICE_RATE, 0.8)
  const candidate = deriveAutopsySkillCandidates([row(0), row(1)])[0]
  assert.equal(candidate.successRows.length, 2)
  assert.equal(candidate.failureRows.length, 0)
  assert.equal(autopsyPracticeReady(candidate), true)
})

test('the same controlled retest case can count only once and its latest outcome wins', () => {
  const selected = distinctLatestRetestRows([
    row(0, true, 'incident diagnosis', 'same-case'),
    row(1, false, 'incident diagnosis', 'same-case'),
  ])
  assert.equal(selected.length, 1)
  assert.equal(selected[0].retest_passed, false)
})

test('controlled practice failures reduce practice readiness rather than becoming fake holdouts', () => {
  const candidate = deriveAutopsySkillCandidates([row(0), row(1, false), row(2)])[0]
  assert.equal(candidate.successRows.length, 2)
  assert.equal(candidate.failureRows.length, 1)
  assert.equal(autopsyPracticeReady(candidate), false)
})

test('different problem classes never share practice evidence', () => {
  const candidates = deriveAutopsySkillCandidates([
    row(0, true, 'incident diagnosis'),
    row(1, true, 'incident diagnosis'),
    row(2, true, 'database performance'),
    row(3, true, 'database performance'),
  ])
  assert.equal(candidates.length, 2)
  assert.notEqual(candidates[0].skillKey, candidates[1].skillKey)
})

test('runtime preparation never populates holdout counters or validates a skill from controlled retests', () => {
  const source = file('../lib/ai/cos/failureAutopsyPromotion.ts')
  assert.match(source, /source_kind: 'failure_autopsy_controlled_practice'/)
  assert.match(source, /evidenceRole: 'controlled_practice_only'/)
  assert.match(source, /status: 'practiced'/)
  assert.match(source, /holdout_attempts: 0/)
  assert.match(source, /private_holdout_required: true/)
  assert.doesNotMatch(source, /status: 'validated'/)
  assert.doesNotMatch(source, /experience_kind: 'holdout'/)
})

test('practice reconciliation preserves strong and sticky weakened lifecycle states', () => {
  const source = file('../lib/ai/cos/failureAutopsyPromotion.ts')
  assert.match(source, /\['validated', 'learned', 'mastered', 'weakened', 'quarantined'\]/)
  assert.match(source, /weakened_at is sticky until fresh separately recorded private holdout revalidation clears it/)
  assert.doesNotMatch(source, /weakened_at: null/)
})
