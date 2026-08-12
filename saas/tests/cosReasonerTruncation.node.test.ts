// saas/tests/cosReasonerTruncation.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { salvageTruncatedAnswer, parseLocalResult, recoverLooseAnswerAndConfidence } from '../lib/ai/cos/reasonerOutput'

const TRUNCATED = '{ "answer": "The sudden increase in API p95 latency specifically for enterprise tenants, despite normal database CPU and memory usage and no recent deployments or traffic changes, points towards several potential architectural issues. Here '

test('an answer cut off mid-string is recovered instead of discarded', () => {
  const salvaged = salvageTruncatedAnswer(TRUNCATED)
  assert.ok(salvaged)
  assert.ok(salvaged!.startsWith('The sudden increase'))
  assert.ok(!salvaged!.includes('"answer"'))
})

test('a cut landing AFTER the answer string closed is still salvaged', () => {
  const raw = '{"answer":"Connection pool saturation is the likeliest cause: enterprise requests hold pooled connections longer and smaller tenants queue behind them, which shows up as wait time rather than CPU. Confirm with pg_stat_activity wait_event distribution.","confid'
  const salvaged = salvageTruncatedAnswer(raw)
  assert.ok(salvaged)
  assert.ok(salvaged!.startsWith('Connection pool saturation'))
  assert.ok(!salvaged!.includes('confid'))
})

test('a scrap too short to be useful is not salvaged', () => {
  assert.equal(salvageTruncatedAnswer('{ "answer": "Well, '), null)
})

test('output with no answer field is not salvaged', () => {
  assert.equal(salvageTruncatedAnswer('I think the problem is probably contention somewhere in the stack.'), null)
})

test('escapes written before the cut are decoded', () => {
  const raw = '{ "answer": "First cause: connection pool saturation.\\nConfirm with pg_stat_activity wait_event distribution, which separates execution time from queue time across the affected tenants and their neighbours. Second cause'
  const salvaged = salvageTruncatedAnswer(raw)
  assert.ok(salvaged)
  assert.ok(salvaged!.includes('\n'))
  assert.ok(!salvaged!.includes('\\n'))
})

test('a complete object still parses normally, with its confidence intact', () => {
  const parsed = parseLocalResult('{"answer":"Connection pool saturation, confirmed via pg_stat_activity wait_event distribution.","confidence":0.81}')
  assert.ok(parsed)
  assert.equal(parsed!.confidence, 0.81)
  assert.equal(parsed!.truncated, undefined)
})

test('a truncated answer is returned flagged, and claims no confidence it never produced', () => {
  const parsed = parseLocalResult(TRUNCATED)
  assert.ok(parsed)
  assert.equal(parsed!.truncated, true)
  assert.equal(parsed!.confidence, 0)
})

test('literal newline inside JSON answer is recovered when confidence exists', () => {
  const raw = '{"answer":"Connection pool saturation is first.\nConfirm with pg_stat_activity wait_event distribution and pool checkout latency.","confidence":0.84}'
  const recovered = recoverLooseAnswerAndConfidence(raw)
  assert.ok(recovered)
  assert.equal(recovered!.confidence, 0.84)
  assert.ok(recovered!.answer.includes('pool checkout latency'))
})

test('unescaped quotes inside a complete answer no longer discard the response', () => {
  const raw = '{"answer":"The enterprise tier may be hitting the "large tenant" pool. Confirm using pool checkout latency and pg_stat_activity wait_event distribution; falsify if both match small tenants.","confidence":0.86}'
  const parsed = parseLocalResult(raw)
  assert.ok(parsed)
  assert.equal(parsed!.confidence, 0.86)
  assert.equal(parsed!.recovered, true)
  assert.ok(parsed!.answer.includes('large tenant'))
})

test('loose recovery refuses to invent confidence when confidence field is absent', () => {
  const raw = '{"answer":"A long and otherwise useful answer with an unescaped "quote" but no confidence field at the end.'
  assert.equal(recoverLooseAnswerAndConfidence(raw), null)
})
