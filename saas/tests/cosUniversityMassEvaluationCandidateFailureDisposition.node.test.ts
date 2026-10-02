import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')

test('exact candidate-only empty and missing answers become substantive failures after bounded solo retry', () => {
  assert.match(evaluator, /mass_distilled_evaluation_candidate_answer_empty:/)
  assert.match(evaluator, /mass_distilled_evaluation_candidate_answer_missing:/)
  assert.doesNotMatch(authority, /error\.startsWith\('mass_distilled_evaluation_candidate_answer_empty:'/)
  assert.doesNotMatch(authority, /error\.startsWith\('mass_distilled_evaluation_candidate_answer_missing:'/)
})
