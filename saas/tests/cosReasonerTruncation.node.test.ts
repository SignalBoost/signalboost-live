// saas/tests/cosReasonerTruncation.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { salvageTruncatedAnswer, parseLocalResult } from '../lib/ai/cos/reasonerOutput'

// The shape of the real failure: the model was still writing the answer string when it stopped.
const TRUNCATED = '{ "answer": "The sudden increase in API p95 latency specifically for enterprise tenants, despite normal database CPU and memory usage and no recent deployments or traffic changes, points towards several potential architectural issues. Here '

test('an answer cut off mid-string is recovered instead of discarded', () => {
  const salvaged = salvageTruncatedAnswer(TRUNCATED)
  assert.ok(salvaged, 'the text written before the cut must survive')
  assert.ok(salvaged!.startsWith('The sudden increase'))
  assert.ok(!salvaged!.includes('"answer"'), 'the JSON wrapper must not leak into the answer')
})

test('a cut landing AFTER the answer string closed is still salvaged', () => {
  // The other half of the real failure: the model finished the answer, then stopped before the
  // confidence field. Strict parsing fails, and this used to return the user nothing at all.
  const raw = '{"answer":"Connection pool saturation is the likeliest cause: enterprise requests hold pooled connections longer and smaller tenants queue behind them, which shows up as wait time rather than CPU. Confirm with pg_stat_activity wait_event distribution.","confid'
  const salvaged = salvageTruncatedAnswer(raw)
  assert.ok(salvaged)
  assert.ok(salvaged!.startsWith('Connection pool saturation'))
  assert.ok(!salvaged!.includes('confid'), 'the trailing partial key must not leak into the answer')
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
  assert.ok(salvaged!.includes('\n'), 'escaped newlines should become real ones')
  assert.ok(!salvaged!.includes('\\n'), 'no raw escape sequences should survive')
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
  assert.equal(parsed!.confidence, 0, 'no confidence was emitted, so none may be invented')
})
