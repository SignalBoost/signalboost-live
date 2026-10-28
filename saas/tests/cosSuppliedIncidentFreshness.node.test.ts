import test from 'node:test'
import assert from 'node:assert/strict'
import { semanticIntentSuppressesFreshness, semanticIntentRequiresFreshness } from '../lib/ai/cos/cosSemanticTaskIntent.ts'

test('supplied-fact infrastructure analysis does not demand external evidence', () => {
  const intent = { mode: 'general_reasoning' as const, confidence: 0.91, suppliedContextPrimary: true, externalFactsRequired: false }
  assert.equal(semanticIntentSuppressesFreshness(intent), true)
  assert.equal(semanticIntentRequiresFreshness(intent), false)
})

test('live verification and ambiguous factual reasoning retain freshness protection', () => {
  assert.equal(semanticIntentSuppressesFreshness({mode:'external_fact_verification', confidence:0.95, suppliedContextPrimary:false, externalFactsRequired:true}), false)
  assert.equal(semanticIntentSuppressesFreshness({mode:'general_reasoning', confidence:0.95, suppliedContextPrimary:true, externalFactsRequired:true}), false)
  assert.equal(semanticIntentSuppressesFreshness({mode:'general_reasoning', confidence:0.50, suppliedContextPrimary:true, externalFactsRequired:false}), false)
})
