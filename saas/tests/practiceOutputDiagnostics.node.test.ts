// saas/tests/practiceOutputDiagnostics.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { describeUnparseablePractice } from '../lib/ai/cos/practiceOutputDiagnostics.ts'
import { parseLocalResult } from '../lib/ai/cos/reasonerOutput.ts'

test('the label keeps the failure code first so existing readers still match on it', () => {
  const label = describeUnparseablePractice('not json at all')
  assert.ok(label.startsWith('practice_json_unparseable:'), label)
})

test('an empty reply is reported as empty rather than as a silent zero-length sample', () => {
  assert.equal(describeUnparseablePractice(''), 'practice_json_unparseable:chars=0:sample=(empty)')
  assert.equal(describeUnparseablePractice(null), 'practice_json_unparseable:chars=0:sample=(empty)')
  assert.equal(describeUnparseablePractice('   \n  '), 'practice_json_unparseable:chars=6:sample=(empty)')
})

test('the character count distinguishes a truncated long reply from a short refusal', () => {
  const refusal = 'I cannot complete this exercise.'
  assert.match(describeUnparseablePractice(refusal), /chars=32:sample=I cannot complete this exercise\./)

  const truncated = `{"answer":"${'a'.repeat(4000)}`
  const label = describeUnparseablePractice(truncated)
  assert.match(label, /chars=4011:/)
  // Bounded: the sample never carries the whole reply into the queue row.
  assert.ok(label.length < 400, String(label.length))
})

test('newlines are collapsed so the label stays on one readable line', () => {
  const label = describeUnparseablePractice('Here is my answer:\n\n  {"answer":\n"x"}')
  assert.ok(!label.includes('\n'), label)
  assert.match(label, /sample=Here is my answer: \{"answer": "x"\}/)
})

test('the label is only produced for replies the parser genuinely cannot read', () => {
  // Guard against the label being attached to output that parseLocalResult can in fact recover,
  // which would turn a real practice result into a deferral.
  assert.ok(parseLocalResult('{"answer":"a real answer","confidence":0.8}')?.answer)
  assert.ok(parseLocalResult('```json\n{"answer":"fenced","confidence":0.5}\n```')?.answer)
  assert.equal(parseLocalResult(''), null)
})
