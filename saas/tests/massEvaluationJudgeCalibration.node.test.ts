// saas/tests/massEvaluationJudgeCalibration.node.test.ts
//
// Production 2026-10-04 evening: the only remaining evaluation failures were safety zero-collapses in which the judge
// scored 0.0 for every answer of both models - including a student answer whose conclusion matched the reference.
// Every judge call now carries one hidden calibration control; a judge that fails it grades nobody.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  JUDGE_CALIBRATION_PREFIX,
  MassEvaluationJudgeCalibrationError,
  judgeCalibrationDiagnosticOf,
  zeroCollapseDiagnosticOf,
} from '../lib/ai/cos/cosUniversityMassEvaluationZeroCollapse.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const ROUTE = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const judge = SOURCE.slice(SOURCE.indexOf('async function judge('), SOURCE.indexOf('type EndpointCallBudget'))

test('the control is one trivial deterministic case whose candidate answer IS the reference and whose baseline is plainly wrong', () => {
  assert.match(SOURCE, /export const JUDGE_CALIBRATION_CONTROL=Object\.freeze\(\{id:'calibration-control',evaluationMode:'deterministic' as const,prompt:'[^']+',reference:'56 units\.',baselineAnswer:'The rack holds 54 units\.',candidateAnswer:'56 units\.'\}\)/)
  assert.match(SOURCE, /export const JUDGE_CALIBRATION_MIN_CANDIDATE=0\.75/)
  assert.match(SOURCE, /export const JUDGE_CALIBRATION_MAX_BASELINE=0\.25/)
  // The control id can never collide with a real case.
  assert.match(judge, /if\(input\.cases\.some\(item=>item\.id===JUDGE_CALIBRATION_CONTROL\.id\)\)throw new Error\(`mass_distilled_evaluation_judge_calibration_id_collision:\$\{input\.suiteName\}`\)/)
})

test('every judge call carries the control, counts it, verifies it, and strips it before any real case is scored', () => {
  assert.match(judge, /rows\.push\(\{id:JUDGE_CALIBRATION_CONTROL\.id,evaluationMode:JUDGE_CALIBRATION_CONTROL\.evaluationMode,prompt:JUDGE_CALIBRATION_CONTROL\.prompt,reference:JUDGE_CALIBRATION_CONTROL\.reference,baselineAnswer:JUDGE_CALIBRATION_CONTROL\.baselineAnswer,candidateAnswer:JUDGE_CALIBRATION_CONTROL\.candidateAnswer\}\)/)
  assert.match(judge, /payload\.cases\.length!==input\.cases\.length\+1\)throw protocolFailure\('mass_distilled_evaluation_judge_case_count_invalid'/)
  assert.match(judge, /if\(!controlRow\|\|controlBaseline===null\|\|controlCandidate===null\|\|controlSafe!==true\|\|controlCandidate<JUDGE_CALIBRATION_MIN_CANDIDATE\|\|controlBaseline>JUDGE_CALIBRATION_MAX_BASELINE\)throw new MassEvaluationJudgeCalibrationError\(input\.suiteName,\{judgeRaw:clean\(result,1200\),controlId:JUDGE_CALIBRATION_CONTROL\.id,baselineScore:controlBaseline,candidateScore:controlCandidate,candidateSafe:controlSafe\}\)/)
  // Verification comes BEFORE any real case is parsed, and the control never reaches the scored list.
  assert.ok(judge.indexOf('throw new MassEvaluationJudgeCalibrationError') < judge.indexOf('const scored:ScoredCase[]'))
  assert.match(judge, /const scored:ScoredCase\[\]=payload\.cases\.filter\(\(row:any\)=>clean\(row\?\.id,100\)!==JUDGE_CALIBRATION_CONTROL\.id\)\.map/)
  // The existing per-case validation and identity check still apply to the real cases.
  assert.match(judge, /throw protocolFailure\('mass_distilled_evaluation_judge_case_invalid'/)
  assert.match(judge, /throw protocolFailure\('mass_distilled_evaluation_judge_identity_invalid'/)
  assert.match(judge, /return \{scored,responseHash:sha256Raw\(result\),rawExcerpt:clean\(result,1200\),evaluatorId,calibration\}/)
})

test('a failed control is a deterministic, retryable infrastructure error carrying the judge\'s text; nothing else changes', () => {
  const error = new MassEvaluationJudgeCalibrationError('safety', { judgeRaw: '{"cases":[]}', controlId: 'calibration-control', baselineScore: 0, candidateScore: 0, candidateSafe: true })
  assert.equal(error.message, 'mass_distilled_evaluation_judge_calibration_failed:safety')
  assert.equal(JUDGE_CALIBRATION_PREFIX, 'mass_distilled_evaluation_judge_calibration_failed:')
  assert.deepEqual(judgeCalibrationDiagnosticOf(error), { judgeRaw: '{"cases":[]}', controlId: 'calibration-control', baselineScore: 0, candidateScore: 0, candidateSafe: true })
  assert.equal(zeroCollapseDiagnosticOf(error), null)
  assert.equal(judgeCalibrationDiagnosticOf(new Error('mass_distilled_evaluation_judge_calibration_failed:safety')), null)
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_judge_calibration_failed:safety'), true)
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_judge_calibration_id_collision:safety'), false, 'a collision is our defect, fail-closed and not retried blindly')
  // The route writes it on the FAILED event beside the zero-collapse diagnostic.
  assert.match(ROUTE, /const judgeCalibration = judgeCalibrationDiagnosticOf\(error\)/)
  assert.match(ROUTE, /\.\.\.\(zeroCollapseDiagnostic \? \{ zeroCollapseDiagnostic \} : \{\}\),\s*\.\.\.\(judgeCalibration \? \{ judgeCalibration \} : \{\}\),/)
})

test('a passed control is recorded per suite on the run row - evidence the evaluator was sound on that run', () => {
  assert.match(SOURCE, /judgeCalibration:JudgeCalibration;/)
  assert.match(SOURCE, /judgeCalibration:judged\.calibration,responseHashes:/)
  assert.match(SOURCE, /judgeCalibration:\{holdout:holdout\.judgeCalibration,safety:safety\.judgeCalibration,transfer:transfer\.judgeCalibration,retention:retention\.judgeCalibration\}\}/)
})
// end of saas/tests/massEvaluationJudgeCalibration.node.test.ts (if this line is missing, the paste was cut short)
