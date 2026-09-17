// saas/tests/cosUniversityMassEvaluationAnswerFingerprint.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')

function fingerprint(text: string, id: string, finish: string, cap: number) {
  const body = source.match(/function answerFailureFingerprint[\s\S]*?\n}\n/)?.[0]
  assert.ok(body, 'answerFailureFingerprint must exist in the evaluator')
  const js = body
    .replace(/:\s*string(?=[,)])/g, '')
    .replace(/:\s*number(?=[,)])/g, '')
    .replace(/:\s*EvalCase(?=[,)])/g, '')
  const fn = new Function(js + '; return answerFailureFingerprint')() as (t: string, i: { id: string }, f: string, c: number) => string
  return fn(text, { id }, finish, cap)
}

const ID = '0ee6ecdba3940d76'

test('each distinct truncation cause produces a distinct fingerprint', () => {
  const leakedThinking = fingerprint('<think>hidden reasoning that never ends', ID, 'length', 1024)
  const noMarker = fingerprint('An answer written as prose with no markers at all', ID, 'length', 1024)
  const openNoClose = fingerprint(`<<<ANSWER:${ID}>>>\nstarted and cut off`, ID, 'length', 1024)
  const wrongCase = fingerprint('<<<ANSWER:1c2f9cade899532f>>>\nx\n<<<END:1c2f9cade899532f>>>', ID, 'stop', 1024)

  assert.equal(leakedThinking, 'finish=length:think=1:open=0:close=0:other=0:cap=1024')
  assert.equal(noMarker, 'finish=length:think=0:open=0:close=0:other=0:cap=1024')
  assert.equal(openNoClose, 'finish=length:think=0:open=1:close=0:other=0:cap=1024')
  assert.equal(wrongCase, 'finish=stop:think=0:open=0:close=0:other=1:cap=1024')
  assert.equal(new Set([leakedThinking, noMarker, openNoClose, wrongCase]).size, 4)
})

test('the same cause repeats identically, so the circuit breaker still counts identical failures', () => {
  const first = fingerprint('<think>hidden reasoning', ID, 'length', 1024)
  const second = fingerprint('<think>hidden reasoning that differs in wording entirely', ID, 'length', 1024)
  assert.equal(first, second)
})

test('no model output, prompt or answer content can reach the fingerprint', () => {
  const secretish = fingerprint('the answer is 42 and the key is sk-live-should-never-appear', ID, 'length', 1024)
  assert.doesNotMatch(secretish, /42|sk-live|answer is/)
  assert.match(secretish, /^finish=[a-z]+:think=[01]:open=[01]:close=[01]:other=[01]:cap=\d+$/)
})

test('the error name and the fail-closed truncation behaviour are unchanged', () => {
  assert.match(source, /throw new Error\(`mass_distilled_evaluation_answer_missing:\$\{item\.id\}`\)/)
  assert.match(source, /if\(solo\.missing\.length\)throw new Error\(solo\.errors\[id\]\)/)
  assert.match(source, /const ENDPOINT_CALLS = 8/)
})

test('the requested cap is computed once and used for both the request and the fingerprint', () => {
  assert.match(source, /const cap=massEvaluationOutputTokens\(input\.cases\.length,userPrompt\)/)
  assert.match(source, /max_tokens:cap,/)
  assert.doesNotMatch(source, /max_tokens:massEvaluationOutputTokens/)
})

test('this evaluator repair advances the infrastructure repair epoch', () => {
  assert.match(authority, /MASS_EVALUATION_INFRASTRUCTURE_REPAIR_REF = 'mass_evaluation_answer_failure_fingerprint'/)
  assert.match(authority, /MASS_EVALUATION_INFRASTRUCTURE_REPAIR_AT = '2026-09-17T22:10:00Z'/)
  assert.match(authority, /MASS_EVALUATION_MAX_IDENTICAL_INFRASTRUCTURE_FAILURES = 4/)
})
