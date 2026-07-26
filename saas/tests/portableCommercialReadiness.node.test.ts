import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commercialReadinessDimensions,
  createPortableCommercialReadinessReport,
  portableCommercialReadinessReport,
} from '../lib/portable-products/commercial-readiness.ts'
import { portableProductRegistry } from '../lib/portable-products/product-registry.ts'

test('commercial readiness report is deterministic, immutable, and covers every portable once', () => {
  const first = createPortableCommercialReadinessReport()
  const second = createPortableCommercialReadinessReport()

  assert.deepEqual(first, second)
  assert.deepEqual(first, portableCommercialReadinessReport)
  assert.equal(first.totalCount, portableProductRegistry.length)
  assert.deepEqual(first.entries.map(entry => entry.productId), portableProductRegistry.map(entry => entry.manifest.productId))
  assert.equal(new Set(first.entries.map(entry => entry.productId)).size, portableProductRegistry.length)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.entries))
  assert.ok(first.entries.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.checks)))
  assert.ok(first.entries.flatMap(entry => entry.checks).every(check => Object.isFrozen(check) && Object.isFrozen(check.evidence) && Object.isFrozen(check.blockers)))
})

test('architecture completion does not imply commercial readiness', () => {
  const report = createPortableCommercialReadinessReport()

  assert.equal(report.commerciallyReadyCount, 0)
  assert.equal(report.closed, false)
  assert.equal(report.completionPercent, 10)

  for (const entry of report.entries) {
    assert.equal(entry.readyCount, 1)
    assert.equal(entry.totalCount, commercialReadinessDimensions.length)
    assert.equal(entry.completionPercent, 10)
    assert.equal(entry.commerciallyReady, false)
    assert.equal(entry.checks.find(check => check.dimension === 'architecture')?.status, 'ready')
  }
})

test('licensable manifest metadata is not licensing or fulfillment evidence', () => {
  const report = createPortableCommercialReadinessReport()
  const licensableProducts = portableProductRegistry.filter(entry => entry.manifest.licensingAvailable)

  assert.ok(licensableProducts.length > 0)
  for (const descriptor of licensableProducts) {
    const entry = report.entries.find(item => item.productId === descriptor.manifest.productId)
    assert.equal(entry?.checks.find(check => check.dimension === 'licensing-enforcement')?.status, 'blocked')
    assert.equal(entry?.checks.find(check => check.dimension === 'fulfillment-handoff')?.status, 'blocked')
  }
})

test('every missing commercial dimension fails closed with an explicit blocker', () => {
  const report = createPortableCommercialReadinessReport()

  for (const entry of report.entries) {
    for (const check of entry.checks.filter(item => item.dimension !== 'architecture')) {
      assert.equal(check.status, 'blocked')
      assert.deepEqual(check.evidence, [])
      assert.deepEqual(check.blockers, [`missing-${check.dimension}-evidence`])
    }
  }
})
