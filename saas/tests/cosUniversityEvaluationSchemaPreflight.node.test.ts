// saas/tests/cosUniversityEvaluationSchemaPreflight.node.test.ts
//
// 2026-09-20: safety_baseline_score and safety_absolute_threshold_met were deployed in the evaluator before
// their migration was run. Every evaluation completed - provisioning, baseline, candidate, judge, a paid
// RunPod wake - and then died writing the verdict, because PostgREST rejects an insert naming an unknown
// column. No verdict, artifact still evaluation_pending, and since the failure is substantive rather than
// infrastructure it also spent an artifact attempt and a rolling approval each time. Nothing about it looked
// like a missing migration from outside.
//
// These tests pin the cheap check that now runs first, and - more importantly - pin that it only fires for a
// genuinely missing column. Reporting an auth or network fault as a pending migration would send someone to
// run SQL that is already applied while the real fault stayed unnamed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REQUIRED_EVALUATION_RUN_COLUMNS,
  isMissingColumnError,
  missingColumnsFromError,
} from '../lib/ai/cos/cosUniversityEvaluationSchemaPreflight.ts'

test('the columns the evaluator writes by migration are the ones checked', () => {
  assert.deepEqual([...REQUIRED_EVALUATION_RUN_COLUMNS], ['safety_baseline_score', 'safety_absolute_threshold_met'])
  const runner = readFileSync(
    new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url),
    'utf8',
  )
  // If the evaluator stops writing one of these, or the check drifts from what it writes, this fails.
  for (const column of REQUIRED_EVALUATION_RUN_COLUMNS) {
    assert.match(runner, new RegExp(`${column}:`), column)
  }
})

test('an unknown column is recognised by SQLSTATE and by message', () => {
  assert.equal(isMissingColumnError({ code: '42703', message: 'whatever' }), true)
  assert.equal(isMissingColumnError({ message: 'column "safety_absolute_threshold_met" does not exist' }), true)
  assert.equal(isMissingColumnError({ message: 'Column safety_baseline_score DOES NOT EXIST' }), true)
})

test('every other failure keeps its own identity', () => {
  const notSchema = [
    { code: '42501', message: 'permission denied for table cos_university_distilled_evaluation_runs' },
    { code: '42P01', message: 'relation "cos_university_distilled_evaluation_runs" does not exist' },
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { message: 'fetch failed' },
    { message: 'JWT expired' },
    { message: '' },
    {},
    null,
    undefined,
    'column does not exist',
  ]
  for (const error of notSchema) {
    assert.equal(isMissingColumnError(error), false, JSON.stringify(error))
  }
})

test('the report names the column when the error does, and all of them when it does not', () => {
  assert.deepEqual(
    missingColumnsFromError({ message: 'column "safety_baseline_score" does not exist' }),
    ['safety_baseline_score'],
  )
  assert.deepEqual(
    missingColumnsFromError({ code: '42703', message: 'undefined column' }),
    [...REQUIRED_EVALUATION_RUN_COLUMNS],
  )
})

test('the route checks the write surface before it claims, wakes or spends', () => {
  const route = readFileSync(
    new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url),
    'utf8',
  )
  assert.match(route, /async function evaluationSchemaMissingColumns\(\)/)
  assert.match(route, /error: 'evaluation_schema_migration_pending'/)

  // Order is the whole point: the check must precede the balance query, the approval and the claim.
  const check = route.indexOf('const missingColumns = await evaluationSchemaMissingColumns()')
  const balance = route.indexOf('const account = await queryRunpodAccountStatus()')
  const approval = route.indexOf('await ensureRollingMassEvaluationApproval()')
  const claim = route.indexOf('claim = await claimNext()')
  assert.ok(check > 0 && balance > check, 'schema check must run before the balance query')
  assert.ok(approval > check, 'schema check must run before any approval is minted')
  assert.ok(claim > check, 'schema check must run before an artifact is claimed')

  // A non-schema error must not be swallowed into the migration story.
  assert.match(route, /if \(!isMissingColumnError\(probe\.error\)\) throw probe\.error/)
  // It reports a stalled lane rather than a healthy skip, and grants nothing.
  assert.match(route, /blocked: 'evaluation_schema_migration_pending'/)
  assert.match(route, /\}, \{ status: 503 \}\)/)
})
