import assert from 'node:assert/strict'
import test from 'node:test'
import { detectSemanticAbstention, evaluateCredibilityAnswer, provenanceMatchesAnswer } from '../lib/ai/cos/credibilityEvaluation.ts'

test('strict gold evaluation requires every required concept and rejects forbidden claims', () => {
  const gold = { requiredAll: ['pg_stat_activity'], requiredAnyGroups: [['wait_event', 'wait event']], forbidden: ['ping'] }
  assert.equal(evaluateCredibilityAnswer('Inspect pg_stat_activity and compare wait_event by tenant.', gold).correct, true)
  assert.equal(evaluateCredibilityAnswer('Inspect pg_stat_activity and ping the tenant.', gold).correct, false)
})

test('unknown-answer cases reward justified abstention instead of confident invention', () => {
  const result = evaluateCredibilityAnswer('I cannot determine that from the available evidence.', { expectedAbstain: true })
  assert.equal(result.correctness, 1)
  assert.equal(result.abstained, true)
})

test('answerable cases do not reward unnecessary abstention', () => {
  const result = evaluateCredibilityAnswer('There is not enough information.', { requiredAll: ['404'] })
  assert.equal(result.correctness, 0)
})

test('semantic abstention detector is conservative', () => {
  assert.equal(detectSemanticAbstention('I cannot verify that from the evidence.'), true)
  assert.equal(detectSemanticAbstention('This can be verified with pg_stat_activity.'), false)
})

test('provenance truthfulness compares claimed citation labels to execution telemetry', () => {
  assert.equal(provenanceMatchesAnswer('Use [KG1] and [CL2].', { knowledgeFactsCited: 1, learnedItemsCited: 1, userMemoriesCited: 0 }), true)
  assert.equal(provenanceMatchesAnswer('Use [KG1] and [KG2].', { knowledgeFactsCited: 1, learnedItemsCited: 0, userMemoriesCited: 0 }), false)
})
