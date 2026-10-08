// saas/tests/cosUniversityMassEvaluationSoloCandidateAttribution.node.test.ts
//
// Production 2026-10-07: with 12 holdout cases every holdout group is one case, so the first response IS the solo request
// at temperature 0. When the candidate's solo-retry allowance or the call budget was spent, a no-answer solo response threw
// the raw `answer_missing` error, classified as evaluator infrastructure, and the same student re-failed identically on
// every paid wake (answer_missing:36d2ea4c x9, :17e509bb x6 in 24h). It is now the student's own answer, exactly as a
// reproduced solo retry already was. Baseline failures stay fail-closed infrastructure.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const MARKERLESS = 'mass_distilled_evaluation_answer_missing:36d2ea4c166ef920:finish=stop:think=0:open=0:close=0:other=0:cap=1024'
const EMPTY = 'mass_distilled_evaluation_answer_empty:17e509bbe67b375d:finish=stop:think=0:open=1:close=1:other=0:cap=1024'
const EXHAUSTED = 'mass_distilled_evaluation_answer_missing:0ee6ecdba3940d76:finish=length:think=0:open=1:close=0:other=0:cap=1024'

test('the helper maps exactly the three deterministic no-answer solo shapes, and the result is merit', () => {
  assert.match(source, /export function candidateSoloFailure\(failure:string\):string\|null\{/)
  assert.match(source, /if\(candidateSoloOutputExhaustion\(failure\)\)return failure\.replace\('mass_distilled_evaluation_answer_missing:','mass_distilled_evaluation_candidate_output_exhausted:'\)/)
  assert.match(source, /if\(candidateSoloEmptyAnswer\(failure\)\)return failure\.replace\('mass_distilled_evaluation_answer_empty:','mass_distilled_evaluation_candidate_answer_empty:'\)/)
  assert.match(source, /if\(candidateSoloMarkerlessNoAnswer\(failure\)\)return failure\.replace\('mass_distilled_evaluation_answer_missing:','mass_distilled_evaluation_candidate_answer_missing:'\)/)
  const cases = [
    [MARKERLESS, MARKERLESS.replace('mass_distilled_evaluation_answer_missing:', 'mass_distilled_evaluation_candidate_answer_missing:')],
    [EMPTY, EMPTY.replace('mass_distilled_evaluation_answer_empty:', 'mass_distilled_evaluation_candidate_answer_empty:')],
    [EXHAUSTED, EXHAUSTED.replace('mass_distilled_evaluation_answer_missing:', 'mass_distilled_evaluation_candidate_output_exhausted:')],
  ] as const
  for (const [raw, attributed] of cases) {
    assert.equal(isEvaluatorInfrastructureFailure(raw), true, `the raw shape is infrastructure: ${raw}`)
    assert.equal(isEvaluatorInfrastructureFailure(attributed), false, `the attributed shape is the student result: ${attributed}`)
  }
})

test('only a candidate one-case request is attributed when no retry is left; the baseline and batches stay fail-closed', () => {
  assert.match(source, /const attributed=input\.candidate&&cases\.length===1\?candidateSoloFailure\(first\.errors\[id\]\):null\n\s*throw new Error\(attributed\|\|first\.errors\[id\]\)/)
  // The reproduced-retry path is unchanged.
  assert.match(source, /if\(input\.candidate&&candidateSoloMarkerlessNoAnswer\(failure\)\)throw new Error/)
})
