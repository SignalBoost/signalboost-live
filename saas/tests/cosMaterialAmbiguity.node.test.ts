import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  parseCosSemanticTaskIntent,
  semanticIntentIsSelfContainedContentGeneration,
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

test('semantic content-generation intent overrides incidental freshness without requiring exact phrasing', () => {
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'content_generation',
    confidence: 0.96,
    suppliedContextPrimary: true,
    externalFactsRequired: false,
  }))

  assert.ok(intent)
  assert.equal(semanticIntentIsSelfContainedContentGeneration(intent), true)
  assert.equal(semanticIntentSuppressesFreshness(intent), true)
})

test('content generation that actually needs live facts keeps freshness protection', () => {
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'content_generation',
    confidence: 0.96,
    suppliedContextPrimary: false,
    externalFactsRequired: true,
  }))

  assert.ok(intent)
  assert.equal(semanticIntentIsSelfContainedContentGeneration(intent), false)
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
test('reasoning over supplied facts overrides incidental freshness words, like interpreting supplied language does', () => {
  // Production 2026-10-28: an incident report with UTC timestamps and numbered deliverables was refused as a current fact.
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'general_reasoning', confidence: 0.9, suppliedContextPrimary: true, externalFactsRequired: false,
  }))
  assert.ok(intent)
  assert.equal(semanticIntentSuppressesFreshness(intent), true)
  // Still fail-safe: outside facts required, context not primary, or an unsure judge keep freshness protection.
  for (const variant of [
    { mode: 'general_reasoning', confidence: 0.9, suppliedContextPrimary: false, externalFactsRequired: false },
    { mode: 'general_reasoning', confidence: 0.9, suppliedContextPrimary: true, externalFactsRequired: true },
    { mode: 'general_reasoning', confidence: 0.6, suppliedContextPrimary: true, externalFactsRequired: false },
    { mode: 'external_fact_verification', confidence: 0.95, suppliedContextPrimary: true, externalFactsRequired: false },
  ]) assert.equal(semanticIntentSuppressesFreshness(parseCosSemanticTaskIntent(JSON.stringify(variant))), false, JSON.stringify(variant))
  assert.match(source, /general_reasoning means the user wants analysis, diagnosis, ranking, planning or explanation performed on facts, data or a scenario they supplied/)
})

test('recipient-directed CDO inquiry is a writing deliverable even when fact flag conflicts', () => {
  // Reproduces the failed-closed class: questions in the letter are addressed to the CDO, not COS.
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'content_generation', confidence: 0.97, suppliedContextPrimary: true,
    externalFactsRequired: true, recipientInquiryOnly: true,
  }))
  assert.ok(intent)
  assert.equal(semanticIntentIsSelfContainedContentGeneration(intent), true)
  assert.equal(semanticIntentSuppressesFreshness(intent), true)
})

test('letter plus separately requested retirement-policy research retains live evidence gate', () => {
  const intent = parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'content_generation', confidence: 0.97, suppliedContextPrimary: true,
    externalFactsRequired: true, recipientInquiryOnly: false,
  }))
  assert.ok(intent)
  assert.equal(semanticIntentIsSelfContainedContentGeneration(intent), false)
  assert.equal(semanticIntentSuppressesFreshness(intent), false)
  assert.match(source, /recipientInquiryOnly=true ONLY for content_generation/)
  assert.ok(source.includes('no standalone COS research or legal/policy advice was requested'))
})

test('recipient inquiry flag cannot suppress research or rescue an uncertain classification', () => {
  for (const variant of [
    { mode: 'external_fact_verification', confidence: 0.98 },
    { mode: 'content_generation', confidence: 0.61 },
  ]) {
    const intent = parseCosSemanticTaskIntent(JSON.stringify({
      ...variant, suppliedContextPrimary: true, externalFactsRequired: true, recipientInquiryOnly: true,
    }))
    assert.equal(semanticIntentSuppressesFreshness(intent), false)
  }
  assert.equal(parseCosSemanticTaskIntent(JSON.stringify({
    mode: 'content_generation', confidence: 0.98, suppliedContextPrimary: true,
    externalFactsRequired: true, recipientInquiryOnly: 'true',
  })), null)
})
