// saas/tests/distilledEvaluationChunking.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync('lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts', 'utf8')

test('a holdout larger than one batch is chunked, not rejected', () => {
  // The student's real holdout manifest exceeds 12 items; three evaluation attempts failed with
  // distilled_evaluation_holdout_batch_size_unsupported before this. Chunking scores every pinned
  // case; only a suite past the cost ceiling is refused.
  assert.match(source, /if \(expectedHashes\.length > MAX_SUITE_CASES\) throw new Error\('distilled_evaluation_holdout_batch_size_unsupported'\)/)
  assert.match(source, /const MAX_SUITE_CASES = 60/)
  assert.match(source, /function chunkCases\(/)
  assert.match(source, /for \(const chunk of chunkCases\(input\.cases\)\)/)
})

test('chunking changes transport, never coverage', () => {
  assert.match(source, /if \(scored\.length !== input\.cases\.length\) throw new Error\('distilled_evaluation_suite_coverage_incomplete'\)/)
  assert.match(source, /if \(evaluatorId && judge\.evaluatorId !== evaluatorId\) throw new Error\('distilled_evaluation_evaluator_identity_drifted'\)/)
})

test('per-request ceiling is untouched so no request regrows past the streaming envelope', () => {
  assert.match(source, /const MAX_BATCH_CASES = 12/)
  assert.match(source, /input\.cases\.length > MAX_BATCH_CASES/)
})

test('time exhaustion fails by name instead of a silent platform kill', () => {
  // A Vercel kill runs no catch and records nothing — four attempts "vanished" this way today.
  assert.match(source, /const EVAL_WALL_BUDGET_MS = 480_000/)
  assert.match(source, /distilled_evaluation_time_budget_exhausted/)
  assert.match(source, /const deadlineAt = Date\.now\(\) \+ EVAL_WALL_BUDGET_MS/)
})

test('all four suites share one deadline', () => {
  for (const suite of ['holdout', 'safety', 'transfer', 'retention']) {
    assert.match(source, new RegExp(`suiteName: '${suite}'[^}]*deadlineAt`))
  }
})
