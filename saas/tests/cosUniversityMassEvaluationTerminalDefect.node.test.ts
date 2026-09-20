// saas/tests/cosUniversityMassEvaluationTerminalDefect.node.test.ts
//
// A holdout is pinned to an immutable commit. When the failure is a property of that frozen data - a malformed
// reference, rows that do not match the pinned manifest hash, no parquet at the commit, or a commit that no
// longer resolves - every retry re-reads the same bytes and reaches the same verdict, after spending another
// RunPod wake. Only the malformed-format case was recognised as terminal; the rest circled on the retry ladder.
//
// These tests pin both halves: what ends, and what must keep retrying. Quarantining an artifact for a failure
// that a later attempt could have passed is the worse error of the two, so the excluded list matters more.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TERMINAL_HOLDOUT_DATA_DEFECTS,
  isTerminalHoldoutDataDefect,
} from '../lib/ai/cos/cosUniversityMassEvaluationTerminalDefect.ts'

test('failures that are a property of the frozen holdout end the artifact', () => {
  for (const defect of TERMINAL_HOLDOUT_DATA_DEFECTS) {
    assert.equal(isTerminalHoldoutDataDefect(defect), true, defect)
  }
  // The commit itself is gone.
  assert.equal(isTerminalHoldoutDataDefect('distilled_evaluation_hf_tree_http_404'), true)
})

test('structural fingerprints and case ids appended to these errors are still recognised', () => {
  // The evaluator appends detail to several of these names; equality matching would miss them all.
  assert.equal(isTerminalHoldoutDataDefect('mass_distilled_evaluation_holdout_format_invalid:cols=none:len=0'), true)
  assert.equal(isTerminalHoldoutDataDefect('mass_distilled_evaluation_holdout_integrity_failed:case-7'), true)
  assert.equal(isTerminalHoldoutDataDefect('  distilled_evaluation_hf_tree_http_404  '), true)
})

test('availability failures and reader ceilings keep retrying', () => {
  const retryable = [
    // Configuration and availability say nothing about the artifact.
    'distilled_evaluation_hf_token_missing',
    'distilled_evaluation_hf_tree_http_500',
    'distilled_evaluation_hf_tree_http_429',
    'distilled_evaluation_hf_tree_http_403',
    'distilled_evaluation_hf_parquet_http_502',
    // Raising a ceiling is a code fix, and it must not first have quarantined the artifacts it would admit.
    'distilled_evaluation_hf_pinned_parquet_file_ceiling',
    'distilled_evaluation_hf_pinned_parquet_row_ceiling',
    'distilled_evaluation_hf_pinned_parquet_size_ceiling',
    // Runtime, judge and budget failures are attempt-level, not artifact-level.
    'mass_distilled_evaluation_runtime_not_ready:network',
    'mass_distilled_evaluation_judge_unavailable',
    'mass_distilled_evaluation_judge_timeout:safety',
    'mass_distilled_evaluation_time_budget_exhausted',
    'mass_distilled_evaluation_endpoint_call_ceiling_plan:baseline=2',
  ]
  for (const message of retryable) {
    assert.equal(isTerminalHoldoutDataDefect(message), false, message)
  }
})

test('an unrecognised or empty failure never ends an artifact', () => {
  // Default to retryable: an unknown error is not evidence that the holdout is broken.
  for (const message of ['', '   ', null, undefined, 0, {}, 'something_new_we_have_not_seen']) {
    assert.equal(isTerminalHoldoutDataDefect(message), false, String(message))
  }
  // A terminal name appearing mid-message is not a match either - only the error this attempt actually threw.
  assert.equal(isTerminalHoldoutDataDefect('wrapped: mass_distilled_evaluation_holdout_ref_invalid'), false)
})

test('the evaluation route quarantines on a terminal defect and records why', () => {
  const route = readFileSync(
    new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(route, /const terminalDataDefect = isTerminalHoldoutDataDefect\(message\)/)
  assert.match(route, /await quarantineTerminalHoldoutDefect\(claim\)/)
  // The status write stays conditioned on the pending state, so it cannot overwrite another verdict.
  assert.match(route, /\.eq\('status', 'evaluation_pending'\)/)
  // The reason is recorded on the terminal event, not just applied silently.
  assert.match(route, /terminalDataDefect: true, nextStatus: 'quarantined'/)
  // The old single-error branch is gone.
  assert.doesNotMatch(route, /legacyInvalidHoldout/)
})
