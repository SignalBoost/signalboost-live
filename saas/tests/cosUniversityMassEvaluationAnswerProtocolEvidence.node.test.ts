// saas/tests/cosUniversityMassEvaluationAnswerProtocolEvidence.node.test.ts
//
// Production 2026-10-07: 9 of 10 exams of the first full-batch artifact failed with the identical
// answer_missing:36d2ea4c166ef920:finish=stop:think=0:open=0:close=1:other=1:cap=1024, a shape that escaped the
// foreign-opener recovery, and nothing recorded what the response looked like or which model produced it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ANSWER_PROTOCOL_EVIDENCE_PROFILE,
  MassEvaluationAnswerProtocolError,
  answerProtocolDiagnosticOf,
  describeAnswerProtocol,
} from '../lib/ai/cos/cosUniversityMassEvaluationAnswerProtocolEvidence.ts'
import { recoverStoppedSoloForeignOpenCorrectCloseAnswer } from '../lib/ai/cos/cosUniversityMassEvaluationAnswerRecovery.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { judgeProtocolDiagnosticOf, zeroCollapseDiagnosticOf } from '../lib/ai/cos/cosUniversityMassEvaluationZeroCollapse.ts'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const ROUTE = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const CASE = '36d2ea4c166ef920'
const FOREIGN = '0ee6ecdba3940d76'
const MESSAGE = `mass_distilled_evaluation_answer_missing:${CASE}:finish=stop:think=0:open=0:close=1:other=1:cap=1024`
const describe = (text: string, role: 'baseline' | 'candidate' = 'candidate') =>
  describeAnswerProtocol({ text, caseId: CASE, role, cases: 1, finish: 'stop', cap: 1024 })

test('the production fingerprint has several distinct shapes; the diagnostic tells each one apart', () => {
  const shapes = {
    preamble: `Here is the answer.\n<<<ANSWER:${FOREIGN}>>>\nRotate the key.\n<<<END:${CASE}>>>`,
    twoOpeners: `<<<ANSWER:${FOREIGN}>>>\nRotate.\n<<<ANSWER:${FOREIGN}>>>\nRotate the key.\n<<<END:${CASE}>>>`,
    extraEnd: `<<<ANSWER:${FOREIGN}>>>\nRotate.\n<<<END:${FOREIGN}>>>\n<<<END:${CASE}>>>`,
  }
  const seen = new Set<string>()
  for (const [name, text] of Object.entries(shapes)) {
    // Every one is the exact production fingerprint, and the existing recovery rejects every one.
    assert.equal(recoverStoppedSoloForeignOpenCorrectCloseAnswer(text, CASE, 'stop'), null, name)
    const diagnostic = describe(text)
    seen.add(JSON.stringify([diagnostic.markers, diagnostic.leadingChars > 0]))
  }
  assert.equal(seen.size, 3, 'the error string is identical for all three; the diagnostic is not')

  const preamble = describe(shapes.preamble)
  assert.equal(preamble.leadingChars, 'Here is the answer.\n'.length)
  assert.deepEqual(preamble.markers, [`ANSWER:foreign@20`, `END:requested@${shapes.preamble.indexOf(`<<<END:${CASE}>>>`)}`])
  assert.equal(preamble.beforeRequestedClose, shapes.preamble.slice(0, shapes.preamble.indexOf(`<<<END:${CASE}>>>`)))
  assert.deepEqual(describe(shapes.twoOpeners).markers.map(m => m.split('@')[0]), ['ANSWER:foreign', 'ANSWER:foreign', 'END:requested'])
  assert.deepEqual(describe(shapes.extraEnd).markers.map(m => m.split('@')[0]), ['ANSWER:foreign', 'END:foreign', 'END:requested'])
})

test('malformed openers, the requested id and the role are recorded as such', () => {
  const diagnostic = describe(`<<<ANSWER:${CASE}\nbody\n<<<ANSWER:not-an-id>>> x <<<END:${CASE}>>>`, 'baseline')
  assert.deepEqual(diagnostic.markers.map(m => m.split('@')[0]), ['ANSWER:malformed', 'ANSWER:malformed', 'END:requested'])
  assert.equal(diagnostic.role, 'baseline')
  assert.equal(diagnostic.profile, ANSWER_PROTOCOL_EVIDENCE_PROFILE)
  assert.equal(describe('plain text, no markers').markerCount, 0)
  assert.equal(describe('plain text, no markers').beforeRequestedClose, null)
})

test('the diagnostic is bounded whatever the model returns', () => {
  const huge = `${'x'.repeat(9000)}${`<<<ANSWER:${FOREIGN}>>> `.repeat(40)}${'y'.repeat(9000)}<<<END:${CASE}>>>`
  const diagnostic = describe(huge)
  assert.equal(diagnostic.chars, huge.length)
  assert.equal(diagnostic.head.length, 400)
  assert.equal(diagnostic.tail.length, 200)
  assert.equal(diagnostic.beforeRequestedClose?.length, 200)
  assert.equal(diagnostic.markers.length, 12)
  assert.equal(diagnostic.markerCount, 41)
  assert.ok(JSON.stringify(diagnostic).length < 2000)
  // A short response is not quoted twice.
  assert.equal(describe('short').tail, '')
})

test('the error message is unchanged, so the circuit breaker and attribution see exactly what they saw before', () => {
  const error = new MassEvaluationAnswerProtocolError(MESSAGE, describe('x'))
  assert.equal(error.message, MESSAGE)
  assert.equal(isEvaluatorInfrastructureFailure(error.message), isEvaluatorInfrastructureFailure(new Error(MESSAGE).message))
  assert.ok(answerProtocolDiagnosticOf(error))
  assert.equal(answerProtocolDiagnosticOf(new Error(MESSAGE)), null)
  assert.equal(judgeProtocolDiagnosticOf(error), null)
  assert.equal(zeroCollapseDiagnosticOf(error), null)
})

test('the evaluator describes every unparsed case from the full response and throws it at both give-up points', () => {
  assert.match(SOURCE, /const role=input\.model===BASE_MODEL_ID\?'baseline':'candidate';const protocol=Object\.fromEntries\(parsed\.missing\.map\(id=>\[id,describeAnswerProtocol\(\{text,caseId:id,role,cases:input\.cases\.length,finish:finishReason\|\|'',cap\}\)\]\)\);return \{\.\.\.parsed,protocol,/)
  assert.match(SOURCE, /input\.budget\.used\+1\+reserve>input\.budget\.max\)throw new MassEvaluationAnswerProtocolError\(first\.errors\[id\],first\.protocol\[id\]\)/)
  assert.match(SOURCE, /continue\}\s*\/\/[^\n]*\n\s*throw new MassEvaluationAnswerProtocolError\(failure,solo\.protocol\[id\]\)\s*\}/)
  // Recovery, merit reclassification and abstention are untouched.
  assert.match(SOURCE, /\|\| \(cases\.length===1 \? recoverStoppedSoloForeignOpenCorrectCloseAnswer\(text,item\.id,finish\) : null\)/)
  assert.match(SOURCE, /if\(input\.candidate&&candidateSoloMarkerlessNoAnswer\(failure\)\)throw new Error\(failure\.replace/)
  assert.match(SOURCE, /abstained\.set\(id,failure\)/)
  // Nothing reads it back: it is evidence only.
  assert.doesNotMatch(SOURCE, /\.diagnostic\b/)
})

test('the route writes the answer diagnostic on the FAILED exam event only', () => {
  assert.match(ROUTE, /const answerProtocol = answerProtocolDiagnosticOf\(error\)/)
  assert.match(ROUTE, /\.\.\.\(judgeProtocol \? \{ judgeProtocol \} : \{\}\),\s*\.\.\.\(answerProtocol \? \{ answerProtocol \} : \{\}\),/)
  const failedAt = ROUTE.indexOf('eventClaim: FAILED,')
  const production = ROUTE.slice(ROUTE.indexOf('await recordProduction(false', failedAt), ROUTE.indexOf('if (workerQuotaDeferred) {'))
  assert.doesNotMatch(production, /answerProtocol/)
})
// end of saas/tests/cosUniversityMassEvaluationAnswerProtocolEvidence.node.test.ts (if this line is missing, the paste was cut short)
