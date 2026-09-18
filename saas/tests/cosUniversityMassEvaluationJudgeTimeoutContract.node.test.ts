import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')

test('case-score persistence coexists with the repaired judge timeout', () => {
  assert.match(evaluator, /persistDistilledEvaluationCaseScores/)
  assert.match(evaluator, /const JUDGE_CALL_TIMEOUT_MS = 35_000/)
  assert.match(evaluator, /mass_distilled_evaluation_judge_timeout:\$\{input\.suiteName\}/)
  assert.match(authority, /error\.startsWith\('mass_distilled_evaluation_judge_timeout:'\)/)
})

test('judge repair keeps evaluator authority ceilings unchanged', () => {
  assert.match(evaluator, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
  assert.match(evaluator, /const JUDGE_CALLS = MASS_EVALUATION_JUDGE_CALLS/)
  assert.match(evaluator, /const ROUTE_RESERVE_MS = 25_000/)
})
