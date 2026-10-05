// saas/tests/massEvaluationZeroCollapseEvidence.node.test.ts
//
// A suite where both models score 0 on every case is a judge/evaluator defect signal, and until 2026-10-04 it was a
// blind one: the throw discarded the judge's text and both models' answers, and the route recorded only the error code.
// 73 such failures in 24h (safety 41, holdout 22, retention 10) with nothing to read. The failure now carries a
// bounded diagnostic that the route writes on the FAILED event. Nothing else about the failure path changes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MassEvaluationZeroCollapseError,
  ZERO_COLLAPSE_DIAGNOSTIC_CASE_LIMIT,
  ZERO_COLLAPSE_PREFIX,
  zeroCollapseDiagnosticOf,
} from '../lib/ai/cos/cosUniversityMassEvaluationZeroCollapse.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const SOURCE = read('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
const ROUTE = read('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts')

test('the zero-collapse error keeps its exact message, so every classifier that reads it is unchanged', () => {
  const error = new MassEvaluationZeroCollapseError('safety', {
    baselineRaw: ['{"cases":[]}'], candidateRaw: ['s1'], baselineParsed: { s1: 'b' }, candidateParsed: { s1: 'c' },
  })
  assert.equal(error.message, 'mass_distilled_evaluation_judge_zero_collapse:safety')
  assert.equal(ZERO_COLLAPSE_PREFIX, 'mass_distilled_evaluation_judge_zero_collapse:')
  assert.ok(error instanceof Error)
  assert.deepEqual(zeroCollapseDiagnosticOf(error), {
    baselineRaw: ['{"cases":[]}'], candidateRaw: ['s1'], baselineParsed: { s1: 'b' }, candidateParsed: { s1: 'c' },
  })
  // The rolling authority still classifies it by prefix as evaluator infrastructure (retryable), not a student FAIL.
  assert.match(read('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'), /error\.startsWith\('mass_distilled_evaluation_judge_zero_collapse:'\)/)
})

test('any other error carries no diagnostic', () => {
  assert.equal(zeroCollapseDiagnosticOf(new Error('mass_distilled_evaluation_judge_zero_collapse:safety')), null)
  assert.equal(zeroCollapseDiagnosticOf(new Error('x')), null)
  assert.equal(zeroCollapseDiagnosticOf('mass_distilled_evaluation_judge_zero_collapse:safety'), null)
  assert.equal(zeroCollapseDiagnosticOf(null), null)
})

test('the evaluation module and the route both take the error from the one pure module', () => {
  // 2026-10-04 (judge calibration control): the same pure module also carries the calibration error; names may be added.
  assert.match(SOURCE, /import \{[^}]*\bMassEvaluationZeroCollapseError, ZERO_COLLAPSE_DIAGNOSTIC_CASE_LIMIT, type ZeroScoreDiagnostic \} from '\.\/cosUniversityMassEvaluationZeroCollapse\.ts'/)
  assert.match(ROUTE, /import \{[^}]*\bzeroCollapseDiagnosticOf \} from '@\/lib\/ai\/cos\/cosUniversityMassEvaluationZeroCollapse'/)
  assert.doesNotMatch(SOURCE, /class MassEvaluationZeroCollapseError|type ZeroScoreDiagnostic = /)
})

test('suite() throws the carrying error with the same bounded dead-case evidence the success path records', () => {
  // 2026-10-04 later the same day: an explicit candidate_safe:false safety collapse is graded instead (see
  // massEvaluationExplicitUnsafeCollapse); every other collapse still throws with this diagnostic.
  assert.match(SOURCE, /if\(zeroCollapse&&!explicitlyUnsafe\)throw new MassEvaluationZeroCollapseError\(input\.name,deadCaseEvidence\(deadCases\.slice\(0,ZERO_COLLAPSE_DIAGNOSTIC_CASE_LIMIT\),input\.baseline,input\.candidate,judged\.rawExcerpt\)\)/)
  assert.equal(ZERO_COLLAPSE_DIAGNOSTIC_CASE_LIMIT, 6)
  // Bounds: the judge text is cut to 1200 characters, each answer to 600; the judge call's own excerpt is 1200.
  assert.match(SOURCE, /baselineRaw: Object\.freeze\(\[clean\(judgeExcerpt, 1200\)\]\)/)
  assert.match(SOURCE, /out\[id\] = clean\(answers\.answers\.get\(id\) \|\| '', 600\)/)
  assert.match(SOURCE, /rawExcerpt:clean\(result,1200\)/)
  // The system prompt is never part of the diagnostic: deadCaseEvidence reads only the answers maps and the judge text.
  const fn = SOURCE.slice(SOURCE.indexOf('function deadCaseEvidence('), SOURCE.indexOf('async function suite('))
  assert.doesNotMatch(fn, /systemPrompt|prompt:|reference|apiKey|Authorization/)
})

test('the dead judgeExcerpt path is gone: a collapsed suite never returned, so nothing could ever be stored there', () => {
  assert.doesNotMatch(SOURCE, /judgeExcerpt:(string\|null|zeroCollapse|judged)/)
  assert.doesNotMatch(SOURCE, /zeroScoreJudgeExcerpts/)
  // Partial dead cases (suite still graded) keep their diagnostics on the run row, unchanged.
  assert.match(SOURCE, /zeroScoreDiagnostic:deadCaseDiagnostic/)
  assert.match(SOURCE, /zeroScoreDiagnostics:Object\.fromEntries/)
})

test('the route writes the diagnostic on the FAILED event only, beside the error code and our own frames', () => {
  assert.match(ROUTE, /const zeroCollapseDiagnostic = zeroCollapseDiagnosticOf\(error\)/)
  const failedAt = ROUTE.indexOf('eventClaim: FAILED,')
  const failed = ROUTE.slice(failedAt, ROUTE.indexOf('await recordProduction(false', failedAt))
  assert.match(failed, /error: clean\(message, 500\),/)
  assert.match(failed, /\.\.\.\(frames\.length \? \{ errorFrames: frames \} : \{\}\),\s*\.\.\.\(zeroCollapseDiagnostic \? \{ zeroCollapseDiagnostic \} : \{\}\),/)
  // The production-path record (no per-artifact row) stays as it was: code, frames, ids.
  const production = ROUTE.slice(ROUTE.indexOf('await recordProduction(false', failedAt), ROUTE.indexOf('if (workerQuotaDeferred) {'))
  assert.doesNotMatch(production, /zeroCollapseDiagnostic/)
})
// end of saas/tests/massEvaluationZeroCollapseEvidence.node.test.ts (if this line is missing, the paste was cut short)
