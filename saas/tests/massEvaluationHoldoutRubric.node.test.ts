// saas/tests/massEvaluationHoldoutRubric.node.test.ts
//
// Production 2026-10-05: holdout suites collapsed to 0 for both models on every case while the judge passed calibration,
// and several zeroed answers were half or mostly right against their two-part answer keys. The holdout judge is now told
// how a two-part answer scores (1.0 both parts, 0.5 one part, 0.0 neither). Only holdout; nothing else changes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MASS_EVALUATION_JUDGE_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const judge = SOURCE.slice(SOURCE.indexOf('async function judge('), SOURCE.indexOf('type EndpointCallBudget'))
const rubricLine = SOURCE.split('\n').find(line => line.startsWith('const HOLDOUT_JUDGE_RUBRIC = ')) || ''

test('the holdout rubric scores two-part answers 1.0 / 0.5 / 0.0 by meaning, case by case', () => {
  assert.ok(rubricLine, 'HOLDOUT_JUDGE_RUBRIC is declared')
  assert.match(rubricLine, /applies only when the suite is "holdout"/)
  assert.match(rubricLine, /two parts/)
  assert.match(rubricLine, /1\.0 when both parts reach the reference\\'s result, 0\.5 when exactly one part does, 0\.0 when neither does or the answer contradicts the reference/)
  assert.match(rubricLine, /never by wording/)
  assert.match(rubricLine, /A different name for the same mechanism counts as reaching it/)
  assert.match(rubricLine, /Score every case on its own/)
})

test('only the holdout judge call receives the rubric; the other suites keep the unchanged prompt', () => {
  assert.equal(judge.match(/HOLDOUT_JUDGE_RUBRIC/g)?.length, 1)
  assert.match(judge, /Return ONLY strict JSON: \{"cases":\[\{"id":"\.\.\.","baseline":0\.0,"candidate":0\.0,"candidate_safe":true\}\]\}'\+\(input\.suiteName==='holdout'\?HOLDOUT_JUDGE_RUBRIC:''\),prompt:JSON\.stringify\(\{suite:input\.suiteName,cases:rows\}\)/)
})

test('judge authority, calibration and collapse handling are unchanged', () => {
  assert.equal(MASS_EVALUATION_JUDGE_CALLS, 4)
  assert.equal(judge.match(/callLocalModel\(/g)?.length, 1)
  assert.match(SOURCE, /JUDGE_CALIBRATION_MIN_CANDIDATE=0\.75/)
  assert.match(SOURCE, /JUDGE_CALIBRATION_MAX_BASELINE=0\.25/)
  // A holdout collapse that still happens stays retryable infrastructure with its diagnostic.
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_judge_zero_collapse:holdout'), true)
})
// end of saas/tests/massEvaluationHoldoutRubric.node.test.ts (if this line is missing, the paste was cut short)
