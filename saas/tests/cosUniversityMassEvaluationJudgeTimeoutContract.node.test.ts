import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')

test('case-score persistence coexists with the repaired judge timeout', () => {
  assert.match(evaluator, /persistDistilledEvaluationCaseScores/)
  assert.match(evaluator, /const JUDGE_CALL_TIMEOUT_MS = 60_000/)
  assert.match(evaluator, /const HOLDOUT_JUDGE_CALL_TIMEOUT_MS = 75_000/)
  assert.match(evaluator, /const JUDGE_MAX_OUTPUT_TOKENS = 512/)
  assert.match(evaluator, /maxTokens:JUDGE_MAX_OUTPUT_TOKENS/)
  assert.match(evaluator, /timeoutMs:input\.suiteName==='holdout'\?HOLDOUT_JUDGE_CALL_TIMEOUT_MS:JUDGE_CALL_TIMEOUT_MS/)
  assert.match(evaluator, /input\.deadlineMs,input\.suiteName==='holdout'\?HOLDOUT_JUDGE_CALL_TIMEOUT_MS:JUDGE_CALL_TIMEOUT_MS/)
  assert.match(evaluator, /mass_distilled_evaluation_judge_timeout:\$\{input\.suiteName\}/)
  assert.match(authority, /error\.startsWith\('mass_distilled_evaluation_judge_timeout:'\)/)
})

test('judge fail-fast repair keeps evaluator authority ceilings unchanged', () => {
  assert.match(evaluator, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
  assert.match(evaluator, /const JUDGE_CALLS = MASS_EVALUATION_JUDGE_CALLS/)
  assert.match(evaluator, /const ROUTE_RESERVE_MS = 25_000/)
  assert.match(evaluator, /Math\.min\(ceilingMs,remaining\(deadlineMs\)\)/)
  assert.match(evaluator, /const holdout=await suite[\s\S]*const safety=await suite[\s\S]*const transfer=await suite[\s\S]*const retention=await suite/)
})
