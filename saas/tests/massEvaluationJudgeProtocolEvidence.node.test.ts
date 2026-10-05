// saas/tests/massEvaluationJudgeProtocolEvidence.node.test.ts
//
// Production 2026-10-04 evening: judge_case_invalid was 3 of the 4 judge failures and recorded only its name. The four
// protocol failures keep their exact messages (the rolling authority matches them by equality) and now carry the
// judge's raw reply and which rule it broke.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MassEvaluationJudgeProtocolError,
  judgeCalibrationDiagnosticOf,
  judgeProtocolDiagnosticOf,
  zeroCollapseDiagnosticOf,
} from '../lib/ai/cos/cosUniversityMassEvaluationZeroCollapse.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const ROUTE = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const judge = SOURCE.slice(SOURCE.indexOf('async function judge('), SOURCE.indexOf('type EndpointCallBudget'))

const MESSAGES = [
  'mass_distilled_evaluation_judge_json_invalid',
  'mass_distilled_evaluation_judge_case_count_invalid',
  'mass_distilled_evaluation_judge_case_invalid',
  'mass_distilled_evaluation_judge_identity_invalid',
]

test('the four protocol failures keep their exact messages and stay retryable infrastructure', () => {
  for (const message of MESSAGES) {
    const error = new MassEvaluationJudgeProtocolError(message, { judgeRaw: 'x', rule: 'json_invalid', caseId: null, returned: null, expected: 5 })
    assert.equal(error.message, message)
    assert.equal(isEvaluatorInfrastructureFailure(error.message), true, message)
    assert.ok(judgeProtocolDiagnosticOf(error))
    assert.equal(zeroCollapseDiagnosticOf(error), null)
    assert.equal(judgeCalibrationDiagnosticOf(error), null)
  }
  assert.equal(judgeProtocolDiagnosticOf(new Error('mass_distilled_evaluation_judge_case_invalid')), null)
})

test('every protocol throw in the judge carries the raw reply, the broken rule, the case id and the counts', () => {
  assert.match(judge, /const protocolFailure=\(message:string,rule:string,caseId:unknown,returned:number\|null\)=>new MassEvaluationJudgeProtocolError\(message,\{judgeRaw:clean\(result,1200\),rule,caseId:caseId===null\|\|caseId===undefined\?null:clean\(caseId,100\),returned,expected:input\.cases\.length\+1\}\)/)
  assert.match(judge, /catch\{throw protocolFailure\('mass_distilled_evaluation_judge_json_invalid','json_invalid',null,null\)\}/)
  assert.match(judge, /throw protocolFailure\('mass_distilled_evaluation_judge_case_count_invalid','case_count',null,Array\.isArray\(payload\?\.cases\)\?payload\.cases\.length:null\)/)
  assert.match(judge, /throw protocolFailure\('mass_distilled_evaluation_judge_case_invalid',!expected\.has\(id\)\?'unknown_id':baseline===null\|\|candidate===null\?'score_invalid':'candidate_safe_missing',row\?\.id,payload\.cases\.length\)/)
  assert.match(judge, /throw protocolFailure\('mass_distilled_evaluation_judge_identity_invalid','duplicate_id',null,payload\.cases\.length\)/)
  // No bare protocol Error remains.
  assert.doesNotMatch(judge, /new Error\('mass_distilled_evaluation_judge_(json|case_count|case|identity)_invalid'\)/)
})

test('the route writes the protocol diagnostic on the FAILED event only', () => {
  assert.match(ROUTE, /const judgeProtocol = judgeProtocolDiagnosticOf\(error\)/)
  assert.match(ROUTE, /\.\.\.\(judgeCalibration \? \{ judgeCalibration \} : \{\}\),\s*\.\.\.\(judgeProtocol \? \{ judgeProtocol \} : \{\}\),/)
  const failedAt = ROUTE.indexOf('eventClaim: FAILED,')
  const production = ROUTE.slice(ROUTE.indexOf('await recordProduction(false', failedAt), ROUTE.indexOf('if (workerQuotaDeferred) {'))
  assert.doesNotMatch(production, /judgeProtocol/)
})
// end of saas/tests/massEvaluationJudgeProtocolEvidence.node.test.ts (if this line is missing, the paste was cut short)
