// saas/tests/demoPricing.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount } from '../lib/demo/pricing/index.ts'

test('15% off a $19.99 item rounds to the nearest cent', () => {
  assert.equal(applyDiscount(1999, 15), 1699)
})

test('50% off a $10.01 item rounds up', () => {
  assert.equal(applyDiscount(1001, 50), 501)
})

test('0% off returns the original price', () => {
  assert.equal(applyDiscount(2500, 0), 2500)
})
