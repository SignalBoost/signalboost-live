// saas/tests/cosUniversityMassEvaluationAnswerRecovery.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recoverStoppedSoloForeignOpenCorrectCloseAnswer, recoverStoppedSoloMissingOpenAnswer, recoverStoppedSoloWrappedAnswer, recoverStoppedSoloForeignEndAnswer, recoverStoppedSoloCorrectOpenForeignEndAnswer } from '../lib/ai/cos/cosUniversityMassEvaluationAnswerRecovery.ts'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('a slipped answer marker no longer aborts the batch: parsed answers are kept and missing ids collected', () => {
  assert.match(source, /function parseAnswersPartial\(text:string,cases:readonly EvalCase\[\],finish:string,cap:number\)/)
  assert.match(source, /const parsed=parseAnswersPartial\(text,input\.cases,clean\(payload\?\.choices\?\.\[0\]\?\.finish_reason,40\),cap\)/)
})

test('slipped cases are retried solo only inside the approved call ceiling and never use calls reserved for later suites', () => {
  assert.match(source, /if\(!item\|\|input\.budget\.used\+1\+reserve>input\.budget\.max\)throw new Error\(first\.errors\[id\]\)/)
  assert.match(source, /input\.budget\.used\+=1;const solo=await raw\(\[item\]\)/)
  assert.match(source, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
})

test('solo candidate output exhaustion becomes model-quality only after the bounded solo retry reproduces it', () => {
  assert.match(source, /function candidateSoloOutputExhaustion\(error:string\)/)
  assert.match(source, /finish=length:think=0:open=1:close=0:other=0:cap=1024/)
  assert.match(source, /if\(input\.candidate&&candidateSoloOutputExhaustion\(failure\)\)throw new Error\(failure\.replace\('mass_distilled_evaluation_answer_missing:','mass_distilled_evaluation_candidate_output_exhausted:'\)\)/)
  // Baseline truncation and every non-exact shape keep the original fail-closed error.
  assert.match(source, /throw new Error\(failure\)/)
  assert.match(source, /errors\[item\.id\]=`\$\{error instanceof Error\?error\.message:String\(error\)\}:\$\{answerFailureFingerprint\(text,item,finish,cap\)\}`/)
  assert.match(source, /throw new Error\(`mass_distilled_evaluation_answer_missing:\$\{item\.id\}`\)/)
})

test('retry responses are folded into the answer hash and the complete-answer check is kept', () => {
  assert.match(source, /return \{answers:recovered,responseHash:sha256Raw\(parts\.join\(':'\)\)\}/)
  assert.match(source, /if\(answers\.size!==input\.cases\.length\)throw new Error/)
})


test('solo finish=stop with one correct closer and missing opener is recovered without weakening other malformed shapes', () => {
  assert.match(source, /recoverStoppedSoloMissingOpenAnswer/)
  assert.match(source, /cases\.length===1 \? recoverStoppedSoloMissingOpenAnswer\(text,item\.id,finish\) : null/)
})


test('solo finish=stop plain text with no markers is recovered but only on the one-case path', () => {
  assert.match(source, /recoverStoppedSoloPlainAnswer/)
  assert.match(source, /cases\.length===1 \? recoverStoppedSoloPlainAnswer\(text,finish\) : null/)
})


test('solo finish=stop with one foreign or malformed opener and the correct terminal closer is recovered only on the solo path', () => {
  assert.match(source, /recoverStoppedSoloForeignOpenCorrectCloseAnswer/)
  assert.match(source, /cases\.length===1 \? recoverStoppedSoloForeignOpenCorrectCloseAnswer\(text,item\.id,finish\) : null/)
})


test('solo correct-close recovery accepts one foreign opener and ignores only non-protocol trailing text', () => {
  const id='0ba8dfd777f3cd71'
  assert.equal(
    recoverStoppedSoloForeignOpenCorrectCloseAnswer(`<<<ANSWER:wrong-id>>>\nThe result is 16%.\n<<<END:${id}>>>\nDone.`,id,'stop'),
    'The result is 16%.',
  )
  assert.equal(
    recoverStoppedSoloForeignOpenCorrectCloseAnswer(`<<<ANSWER:wrong-id\nThe result is 16%.\n<<<END:${id}>>>`,id,'stop'),
    'The result is 16%.',
  )
  assert.equal(recoverStoppedSoloForeignOpenCorrectCloseAnswer(`<<<ANSWER:a>>>\nA\n<<<ANSWER:b>>>\nB\n<<<END:${id}>>>`,id,'stop'),null)
  assert.equal(recoverStoppedSoloForeignOpenCorrectCloseAnswer(`<<<ANSWER:wrong>>>\n<think>x</think> A\n<<<END:${id}>>>`,id,'stop'),null)
  assert.equal(recoverStoppedSoloForeignOpenCorrectCloseAnswer(`<<<ANSWER:wrong>>>\nA\n<<<END:${id}>>>\n<<<END:other>>>`,id,'stop'),null)
})

test('solo missing-open recovery treats the correct closer as the answer boundary while rejecting trailing protocol blocks', () => {
  const id='0ba8dfd777f3cd71'
  assert.equal(recoverStoppedSoloMissingOpenAnswer(`The result is 16%.\n<<<END:${id}>>>\nDone.`,id,'stop'),'The result is 16%.')
  assert.equal(recoverStoppedSoloMissingOpenAnswer(`The result is 16%.\n<<<END:${id}>>>\n<<<ANSWER:other>>>x`,id,'stop'),null)
})


test('solo normal-stop wrapper prose around one exact answer block is recovered without accepting ambiguity', () => {
  const id='0ba8dfd777f3cd71'
  assert.equal(recoverStoppedSoloWrappedAnswer(`Final answer:\n<<<ANSWER:${id}>>>\n16%\n<<<END:${id}>>>\nDone.`,id,'stop'),'16%')
  assert.equal(recoverStoppedSoloWrappedAnswer(`<<<ANSWER:${id}>>>16%<<<END:${id}>>><<<ANSWER:other>>>x<<<END:other>>>`,id,'stop'),null)
  assert.equal(recoverStoppedSoloWrappedAnswer(`<<<ANSWER:${id}>>>16%<<<END:${id}>>>`,id,'length'),null)
  assert.equal(recoverStoppedSoloWrappedAnswer(`<think>x</think><<<ANSWER:${id}>>>16%<<<END:${id}>>>`,id,'stop'),null)
  assert.match(source, /cases\.length===1 \? recoverStoppedSoloWrappedAnswer\(text,item\.id,finish\) : null/)
})


test('solo normal-stop answer with exactly one foreign END marker is recovered without accepting ambiguity', () => {
  assert.equal(recoverStoppedSoloForeignEndAnswer('The result is 16%.\n<<<END:foreign-id>>>','stop'),'The result is 16%.')
  assert.equal(recoverStoppedSoloForeignEndAnswer('A\n<<<END:x>>>\n<<<END:y>>>','stop'),null)
  assert.equal(recoverStoppedSoloForeignEndAnswer('<<<ANSWER:x>>>A\n<<<END:y>>>','stop'),null)
  assert.equal(recoverStoppedSoloForeignEndAnswer('A\n<<<END:x>>>','length'),null)
  assert.equal(recoverStoppedSoloForeignEndAnswer('<think>x</think>A\n<<<END:y>>>','stop'),null)
  assert.match(source, /cases\.length===1 \? recoverStoppedSoloForeignEndAnswer\(text,finish\) : null/)
})


test('solo normal-stop correct ANSWER opener with one foreign END marker is recovered narrowly', () => {
  const id='0ba8dfd777f3cd71'
  assert.equal(recoverStoppedSoloCorrectOpenForeignEndAnswer(`<<<ANSWER:${id}>>>\nThe result is 16%.\n<<<END:foreign-id>>>`,id,'stop'),'The result is 16%.')
  assert.equal(recoverStoppedSoloCorrectOpenForeignEndAnswer(`<<<ANSWER:${id}>>>\nA\n<<<END:x>>>\n<<<END:y>>>`,id,'stop'),null)
  assert.equal(recoverStoppedSoloCorrectOpenForeignEndAnswer(`<<<ANSWER:${id}>>>\nA\n<<<END:foreign-id>>>`,id,'length'),null)
  assert.equal(recoverStoppedSoloCorrectOpenForeignEndAnswer(`<<<ANSWER:${id}>>>\n<think>x</think>A\n<<<END:foreign-id>>>`,id,'stop'),null)
  assert.match(source, /cases\.length===1 \? recoverStoppedSoloCorrectOpenForeignEndAnswer\(text,item\.id,finish\) : null/)
})

// Production 2026-10-01: repeated candidate-only markerless normal-stop output must
// enter substantive disposition instead of infrastructure retry forever.
{
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  assert.match(source, /function candidateSoloMarkerlessNoAnswer\(error:string\)/)
  assert.match(source, /finish=stop:think=0:open=0:close=0:other=0:cap=1024/)
  assert.match(source, /mass_distilled_evaluation_candidate_answer_missing:/)
}
