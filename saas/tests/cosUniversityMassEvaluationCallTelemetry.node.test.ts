// saas/tests/cosUniversityMassEvaluationCallTelemetry.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

// 2026-09-17: HTTP 502 failures were diagnosed for hours against latency alone, because every evaluator call recorded
// promptTokens, completionTokens, totalTokens and finishReason as null. Two competing explanations for the failures —
// one based on batch size, one on request duration — were both consistent with the latency data and both wrong, since
// 12-case fixed-suite requests complete while 7-case holdout requests return 502. Record what the provider already
// reports so the next occurrence is measured rather than modelled.

test('the provider usage block is recorded rather than three hardcoded nulls', () => {
  assert.match(source, /promptTokens:usage\?\.prompt_tokens\?\?null/)
  assert.match(source, /completionTokens:usage\?\.completion_tokens\?\?null/)
  assert.match(source, /totalTokens:usage\?\.total_tokens\?\?null/)
  assert.doesNotMatch(source, /promptTokens:null,completionTokens:null,totalTokens:null/)
})

test('finish_reason reaches telemetry instead of being parsed and discarded', () => {
  assert.match(source, /finishReason=clean\(payload\?\.choices\?\.\[0\]\?\.finish_reason,40\)\|\|null/)
  assert.doesNotMatch(source, /latencyMs:Date\.now\(\)-started,finishReason:null/)
  assert.match(source, /latencyMs:Date\.now\(\)-started,finishReason\}/)
})

test('a failed call still records what it knows, because failures are what need measuring', () => {
  // usage and finishReason are declared beside httpStatus/success in the same outer scope as the finally block.
  assert.match(source, /let httpStatus:number\|null=null;let success=false;let usage:any=null;let finishReason:string\|null=null/)
  assert.match(source, /finally\{await recordLocalInferenceUsage/)
})

test('the client timeout no longer waits far past the measured gateway cutoff', () => {
  assert.match(source, /const OBSERVED_GATEWAY_CUTOFF_MS = 40_000/)
  assert.match(source, /const ENDPOINT_CALL_TIMEOUT_MS = 50_000/)
  assert.doesNotMatch(source, /ENDPOINT_CALL_TIMEOUT_MS = 120_000/)
})

test('telemetry changes nothing about scoring, planning, thresholds or authority', () => {
  assert.match(source, /const ENDPOINT_CALLS = 8/)
  assert.match(source, /input\.claim\.maxEndpointCalls!==ENDPOINT_CALLS/)
  assert.match(source, /cases:fixedCases,maxGroups:1/)
  assert.match(source, /planMassEvaluationGroups\(holdoutCases,batchPrompt,3\)/)
})
