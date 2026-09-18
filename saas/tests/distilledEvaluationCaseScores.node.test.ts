// saas/tests/distilledEvaluationCaseScores.node.test.ts
// Pins the per-case evidence contract: what the judge returned is what lands, one row per
// (run, suite, case), with malformed input failing closed rather than writing partial evidence.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  buildDistilledEvaluationCaseRows,
  persistDistilledEvaluationCaseScores,
} from '../lib/ai/cos/cosUniversityDistilledEvaluationCaseScores.ts'

const IDENTITY = {
  runKey: 'a'.repeat(64),
  candidateId: 'mass:7568e7a7-f130-47ce-a2ea-0ddedf18a898:e2bb75bbdd2c3fb1',
  artifactHash: 'B'.repeat(64),
  evaluatorId: 'itmounts-independent:Qwen-Qwen3.6-35B-A3B',
  evaluatorVersion: 'cos-mass-distilled-exact-artifact-evaluator-v1',
  observedAt: '2026-09-18T02:00:00.000Z',
}

const CASE = (id: string, baseline: number, candidate: number, safe = true) =>
  ({ id, baseline, candidate, candidateSafe: safe })

test('one row per case per suite, judge values preserved', () => {
  const rows = buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    suites: [
      { suite: 'holdout', scored: [CASE('h1', 0.9, 0.34), CASE('h2', 0.9, 0.9)] },
      { suite: 'safety', scored: [CASE('s1', 1, 1)] },
    ],
  })
  assert.equal(rows.length, 3)
  const holdout = rows.filter(row => row.suite === 'holdout')
  assert.deepEqual(holdout.map(row => row.case_id), ['h1', 'h2'])
  assert.equal(holdout[0].baseline_score, 0.9)
  assert.equal(holdout[0].candidate_score, 0.34)
  assert.equal(rows.every(row => row.run_key === IDENTITY.runKey), true)
})

test('artifact hash is normalized to lower case', () => {
  const [row] = buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    suites: [{ suite: 'retention', scored: [CASE('r1', 1, 1)] }],
  })
  assert.equal(row.trained_artifact_hash, 'b'.repeat(64))
})

test('candidate_safe false is recorded, not dropped', () => {
  const [row] = buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    suites: [{ suite: 'safety', scored: [CASE('s1', 1, 0.2, false)] }],
  })
  assert.equal(row.candidate_safe, false)
})

test('scores are clamped to the column precision', () => {
  const [row] = buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    suites: [{ suite: 'holdout', scored: [CASE('h1', 0.8153846153846154, 0.7)] }],
  })
  assert.equal(row.baseline_score, 0.8154)
})

test('out-of-range and non-numeric scores fail closed', () => {
  for (const bad of [1.01, -0.1, Number.NaN, null, 'x']) {
    assert.throws(() => buildDistilledEvaluationCaseRows({
      ...IDENTITY,
      suites: [{ suite: 'holdout', scored: [{ id: 'h1', baseline: 0.5, candidate: bad as number, candidateSafe: true }] }],
    }), /distilled_evaluation_case_score_invalid/)
  }
})

test('unknown suite, duplicate case and empty input fail closed', () => {
  assert.throws(() => buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    suites: [{ suite: 'holdout' as const, scored: [CASE('h1', 1, 1), CASE('h1', 1, 1)] }],
  }), /distilled_evaluation_case_duplicate/)
  assert.throws(() => buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    suites: [{ suite: 'bogus' as never, scored: [CASE('x', 1, 1)] }],
  }), /distilled_evaluation_case_suite_invalid/)
  assert.throws(() => buildDistilledEvaluationCaseRows({ ...IDENTITY, suites: [] }),
    /distilled_evaluation_case_rows_empty/)
})

test('missing identity fails closed', () => {
  assert.throws(() => buildDistilledEvaluationCaseRows({
    ...IDENTITY,
    runKey: '',
    suites: [{ suite: 'holdout', scored: [CASE('h1', 1, 1)] }],
  }), /distilled_evaluation_case_identity_missing/)
})

test('persist upserts on the composite key and surfaces db errors', async () => {
  const calls: any[] = []
  const okDb = {
    from(table: string) {
      return {
        upsert(rows: unknown, options: unknown) {
          calls.push({ table, rows, options })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  const written = await persistDistilledEvaluationCaseScores({
    db: okDb,
    ...IDENTITY,
    suites: [{ suite: 'transfer', scored: [CASE('t1', 1, 1), CASE('t2', 1, 0.5)] }],
  })
  assert.equal(written, 2)
  assert.equal(calls[0].table, 'cos_university_distilled_evaluation_cases')
  assert.deepEqual(calls[0].options, { onConflict: 'run_key,suite,case_id' })

  const failDb = { from: () => ({ upsert: () => Promise.resolve({ error: new Error('insert_failed') }) }) }
  await assert.rejects(() => persistDistilledEvaluationCaseScores({
    db: failDb,
    ...IDENTITY,
    suites: [{ suite: 'transfer', scored: [CASE('t1', 1, 1)] }],
  }), /insert_failed/)
})

test('the mass evaluator persists all four suites after the run row', () => {
  const source = readFileSync(
    new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /import \{ persistDistilledEvaluationCaseScores \}/)
  const upsertAt = source.indexOf('if(saved.error)throw saved.error')
  const persistAt = source.indexOf('await persistDistilledEvaluationCaseScores(')
  const claimAt = source.indexOf('await submitClaim(')
  assert.ok(upsertAt > 0 && persistAt > upsertAt, 'persists after the run row exists')
  assert.ok(claimAt > persistAt, 'persists before any claim is submitted')
  for (const suite of ['holdout', 'safety', 'transfer', 'retention']) {
    assert.match(source, new RegExp(`\\{suite:'${suite}',scored:${suite}\\.scored\\}`))
  }
  // Promotion must not read these rows back.
  assert.doesNotMatch(source, /cos_university_distilled_evaluation_cases[\s\S]{0,200}select/)
})
