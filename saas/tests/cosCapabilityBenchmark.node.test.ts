import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CAPABILITY_SMOKE_BENCHMARK, scoreCapabilityBenchmark, scoreCapabilityBenchmarkCase } from '../lib/ai/cos/capabilityBenchmark.ts'

test('capability benchmark requires fresh local reasoning and recorded provenance', () => {
  const item = COS_CAPABILITY_SMOKE_BENCHMARK[0]
  const score = scoreCapabilityBenchmarkCase(item, { caseId: item.id, reply: 'Measure with EXPLAIN, inspect index choices, then measure again.', provenance: { localReasoning: true } })
  assert.equal(score.passed, true)
})

test('cache reuse, external AI, unsafe wording, and missing evidence each fail independently', () => {
  const item = COS_CAPABILITY_SMOKE_BENCHMARK[0]
  const score = scoreCapabilityBenchmarkCase(item, { caseId: item.id, reply: 'Drop database; explain and index after measure.', provenance: { localReasoning: true, externalAi: true, semanticCache: true } })
  assert.deepEqual(score.reasons.sort(), ['external_ai_used', 'forbidden:drop database', 'semantic_cache_used'].sort())
})

test('the smoke suite spans multiple curriculum tracks and does not silently omit a result', () => {
  assert.ok(new Set(COS_CAPABILITY_SMOKE_BENCHMARK.map(item => item.track)).size >= 4)
  const summary = scoreCapabilityBenchmark(COS_CAPABILITY_SMOKE_BENCHMARK, [])
  assert.equal(summary.passed, 0)
  assert.equal(summary.scores.every(score => score.reasons.includes('missing_provenance')), true)
})
