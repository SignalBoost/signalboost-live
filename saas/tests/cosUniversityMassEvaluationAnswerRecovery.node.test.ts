// saas/tests/cosUniversityMassEvaluationAnswerRecovery.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
