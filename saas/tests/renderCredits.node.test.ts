// saas/tests/renderCredits.node.test.ts
//
// Pins the render-credit pricing math: the markup and credit conversion that
// decide the platform's margin. The DB atomic deduct and daily cap are exercised
// against a live DB elsewhere; here we lock the pure math that must never drift.
//
// Run: node --test tests/renderCredits.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'
import { RENDER_MARKUP, creditsForProviderCost } from '../lib/credits/renderPricing.ts'

test('markup is 3x', () => {
  assert.equal(RENDER_MARKUP, 3)
})

test('a provider cost of 100c charges the user 300 credits (3x)', () => {
  assert.equal(creditsForProviderCost(100), 300)
})

test('rounds up so the platform never undercharges', () => {
  // 33c * 3 = 99 -> 99; 33.4c would ceil provider first
  assert.equal(creditsForProviderCost(33), 99)
  assert.equal(creditsForProviderCost(33.4), 102) // ceil(34)*3
})

test('zero or negative provider cost never charges negative credits', () => {
  assert.equal(creditsForProviderCost(0), 0)
  assert.equal(creditsForProviderCost(-50), 0)
})

test('a typical $4 render (400c) costs the user 1200 credits (~$12 at 1c/credit)', () => {
  assert.equal(creditsForProviderCost(400), 1200)
})
