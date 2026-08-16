// saas/tests/cognitiveFactConsolidation.node.test.ts
//
// Pins fact-level memory quality: contradiction never silently overwrites, staleness decays
// confidence instead of deleting, and pruning only removes what has already decayed below floor.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveFactContradiction,
  factsMateriallyDiffer,
  decayedFactConfidence,
  shouldPruneFact,
  FACT_STALENESS_DAYS,
  FACT_PRUNE_CONFIDENCE_FLOOR,
} from '../lib/ai/cos/cognitiveFactConsolidation.ts'

test('a brand-new fact (no existing row) is never a contradiction', () => {
  const decision = resolveFactContradiction(null, { object: 'blue', confidence: 0.8 })
  assert.equal(decision.isContradiction, false)
  assert.equal(decision.winner, 'incoming')
  assert.equal(decision.persistedConfidence, 0.8)
})

test('reaffirming the same claim (after normalization) is not a contradiction and confidence never drops', () => {
  const decision = resolveFactContradiction({ object: '  The Sky Is Blue  ', confidence: 0.6 }, { object: 'the sky is blue', confidence: 0.9 })
  assert.equal(decision.isContradiction, false)
  assert.equal(decision.persistedConfidence, 0.9)
})

test('reaffirming with a LOWER incoming confidence keeps the higher existing confidence, never regresses', () => {
  const decision = resolveFactContradiction({ object: 'blue', confidence: 0.9 }, { object: 'blue', confidence: 0.4 })
  assert.equal(decision.isContradiction, false)
  assert.equal(decision.persistedConfidence, 0.9)
})

test('a genuinely different object with higher incoming confidence is a contradiction the incoming claim wins', () => {
  const decision = resolveFactContradiction({ object: 'blue', confidence: 0.5 }, { object: 'green', confidence: 0.9 })
  assert.equal(decision.isContradiction, true)
  assert.equal(decision.winner, 'incoming')
  assert.equal(decision.persistedConfidence, 0.9)
})

test('a genuinely different object with LOWER incoming confidence is a contradiction the existing claim wins, and the loser is penalized not deleted', () => {
  const decision = resolveFactContradiction({ object: 'blue', confidence: 0.9 }, { object: 'green', confidence: 0.3 })
  assert.equal(decision.isContradiction, true)
  assert.equal(decision.winner, 'existing')
  assert.ok(decision.persistedConfidence < 0.9, 'existing confidence should be penalized for being contradicted')
  assert.ok(decision.persistedConfidence > 0, 'penalty should never zero out the surviving claim')
})

test('factsMateriallyDiffer ignores case and whitespace but not real differences', () => {
  assert.equal(factsMateriallyDiffer('Paris', '  paris  '), false)
  assert.equal(factsMateriallyDiffer('Paris', 'London'), true)
})

test('a fact updated within the staleness window does not decay', () => {
  const now = new Date('2026-08-16T00:00:00Z')
  const recentlyUpdated = new Date('2026-08-10T00:00:00Z')
  const { periodsElapsed, decayedConfidence } = decayedFactConfidence(0.9, recentlyUpdated, now)
  assert.equal(periodsElapsed, 0)
  assert.equal(decayedConfidence, 0.9)
})

test('a fact untouched for exactly one staleness period decays by one factor', () => {
  const now = new Date('2026-08-16T00:00:00Z')
  const staleUpdatedAt = new Date(now.getTime() - FACT_STALENESS_DAYS * 86_400_000 - 1000)
  const { periodsElapsed, decayedConfidence } = decayedFactConfidence(0.9, staleUpdatedAt, now)
  assert.equal(periodsElapsed, 1)
  assert.ok(decayedConfidence < 0.9)
  assert.ok(decayedConfidence > 0.9 * 0.85 - 0.001 && decayedConfidence < 0.9 * 0.85 + 0.001)
})

test('a fact untouched for three staleness periods decays three times, compounding', () => {
  const now = new Date('2026-08-16T00:00:00Z')
  const veryStale = new Date(now.getTime() - 3 * FACT_STALENESS_DAYS * 86_400_000 - 1000)
  const { periodsElapsed, decayedConfidence } = decayedFactConfidence(0.9, veryStale, now)
  assert.equal(periodsElapsed, 3)
  assert.ok(decayedConfidence < 0.9 * 0.85)
})

test('shouldPruneFact only fires below the floor, never at or above it', () => {
  assert.equal(shouldPruneFact(FACT_PRUNE_CONFIDENCE_FLOOR - 0.01), true)
  assert.equal(shouldPruneFact(FACT_PRUNE_CONFIDENCE_FLOOR), false)
  assert.equal(shouldPruneFact(FACT_PRUNE_CONFIDENCE_FLOOR + 0.01), false)
})
