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
  assert.match(source, /const MAX_SUITE_CASES = DISTILLED_EVALUATION_MAX_HOLDOUT_CASES/)
  assert.match(source, /function chunkCases\(/)
  assert.match(source, /for \(const chunk of chunkCases\(input\.cases\)\)/)
})

test('chunking changes transport, never coverage', () => {
  assert.match(source, /if \(scored\.length !== input\.cases\.length\) throw new Error\('distilled_evaluation_suite_coverage_incomplete'\)/)
  assert.match(source, /if \(evaluatorId && judge\.evaluatorId !== evaluatorId\) throw new Error\('distilled_evaluation_evaluator_identity_drifted'\)/)
})

test('per-request ceiling is untouched so no request regrows past the streaming envelope', () => {
  assert.match(source, /const MAX_BATCH_CASES = DISTILLED_EVALUATION_MAX_BATCH_CASES/)
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

test('one mangled marker recovers with a solo retry instead of aborting the evaluation', () => {
  // The 15:08 attempt died on distilled_evaluation_answer_missing over a single marker slip in a
  // twelve-case batch. Slipped cases are re-asked one at a time; only a case that fails alone
  // fails the evaluation, under the same name, so coverage is never silently thinned.
  assert.match(source, /function collectBatchAnswers\(/)
  assert.match(source, /const solo = await streamSingleCase\(/)
  assert.match(source, /recoveredCaseIds: collected\.missing\.map\(item => item\.id\)/)
  assert.match(source, /if \(!answer\) throw new Error\(`distilled_evaluation_answer_missing:\$\{item\.id\}`\)/)
  assert.doesNotMatch(source, /function parseBatchAnswers\(/)
  assert.match(source, /if \(budget\.soloRetryCalls >= budget\.maxSoloRetryCalls\)/)
  assert.match(source, /distilled_evaluation_solo_retry_call_ceiling_exceeded/)
})

test('the solo retry keeps the exact request contract of the batch call', () => {
  assert.match(source, /max_tokens: MIN_BATCH_COMPLETION_TOKENS,\n\s+stream: true,\n\s+chat_template_kwargs: \{ enable_thinking: false \}/)
  assert.match(source, /batchPrompt\(\[input\.item\]\)/)
})

test('retries are part of the recorded response hash', () => {
  assert.match(source, /sha256Raw\(\[text, \.\.\.retryTexts\]\.join\('\\n<<<RETRY>>>\\n'\)\)/)
})

test('evidence submission survives Vercel deployment protection', () => {
  // The 15:56 attempt computed every score, then the platform's deployment-protection wall
  // returned 401 before the internal route ran. Bypass header when the secret exists; public
  // origin otherwise. Either way the HMAC contract with the route is unchanged.
  assert.match(source, /x-vercel-protection-bypass/)
  assert.match(source, /VERCEL_AUTOMATION_BYPASS_SECRET/)
  assert.match(source, /const target = !bypassSecret && publicOrigin \? publicOrigin : origin/)
  assert.match(source, /'x-itmounts-evaluator-signature': signature/)
})

test('judge JSON is located inside fences or preamble, never invented', () => {
  assert.match(source, /const start = result\.indexOf\('\{'\)/)
  assert.match(source, /const end = result\.lastIndexOf\('\}'\)/)
  assert.match(source, /distilled_evaluation_judge_json_invalid/)
})
