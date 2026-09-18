import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  parseCosSemanticTaskIntent,
  semanticIntentRequiresClarification,
  semanticIntentSuppressesFreshness,
} from '../lib/ai/cos/cosSemanticTaskIntent.ts'

const source = readFileSync('lib/ai/cos/cosSemanticTaskIntent.ts', 'utf8')

test('material ambiguity defers premature live lookup even when the eventual answer needs current facts', () => {
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'clarification_required',
    confidence: 0.94,
    suppliedContextPrimary: false,
    externalFactsRequired: true,
  }))

  assert.ok(intent)
  assert.equal(semanticIntentRequiresClarification(intent), true)
  assert.equal(semanticIntentSuppressesFreshness(intent), true)
})

test('low-confidence ambiguity does not bypass fail-safe freshness', () => {
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'clarification_required',
    confidence: 0.61,
    suppliedContextPrimary: false,
    externalFactsRequired: true,
  }))

  assert.ok(intent)
  assert.equal(semanticIntentRequiresClarification(intent), false)
  assert.equal(semanticIntentSuppressesFreshness(intent), false)
})

test('sufficiently specified external verification still uses freshness', () => {
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'external_fact_verification',
    confidence: 0.99,
    suppliedContextPrimary: false,
    externalFactsRequired: true,
  }))

  assert.ok(intent)
  assert.equal(semanticIntentRequiresClarification(intent), false)
  assert.equal(semanticIntentSuppressesFreshness(intent), false)
})

test('clarification policy is structural and domain-general rather than a named weather patch', () => {
  assert.match(source, /essential scope, referent, target, baseline, location, time window, object/i)
  assert.match(source, /at least two plausible interpretations remain/i)
  assert.match(source, /materially change the correct answer or action/i)
  assert.match(source, /conversation already resolves/i)
  assert.match(source, /safely inferred/i)
  assert.match(source, /obvious low-risk default/i)
  assert.match(source, /geography too broad to have one meaningful current value/i)
  assert.doesNotMatch(source, /Poland|Warsaw|Paramaribo/i)
})