import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createPortableCommercialReadinessReport,
  portableCommercialEvidenceKeys,
  portableCommercialReadinessReport,
} from '../lib/portable-products/commercial-readiness.ts'
import { portableProductRegistry } from '../lib/portable-products/product-registry.ts'

test('commercial readiness report is deterministic, immutable, and covers every portable exactly once', () => {
  const first = createPortableCommercialReadinessReport()
  const second = createPortableCommercialReadinessReport()

  assert.deepEqual(first, second)
  assert.deepEqual(first, portableCommercialReadinessReport)
  assert.equal(first.totalCount, portableProductRegistry.length)
  assert.deepEqual(first.entries.map(entry => entry.productId), portableProductRegistry.map(entry => entry.manifest.productId))
  assert.equal(new Set(first.entries.map(entry => entry.productId)).size, portableProductRegistry.length)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.entries))
  assert.ok(first.entries.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.evidence) && Object.isFrozen(entry.missingEvidence) && Object.isFrozen(entry.blockers)))
})

test('commercial readiness fails closed when explicit evidence is absent', () => {
  const report = createPortableCommercialReadinessReport()

  assert.equal(report.readyCount, 0)
  assert.equal(report.completionPercent, 0)
  assert.equal(report.commerciallyReady, false)

  for (const entry of report.entries) {
    assert.equal(entry.state, 'not-ready')
    assert.deepEqual(entry.evidence, [])
    assert.deepEqual(entry.missingEvidence, portableCommercialEvidenceKeys)
    assert.ok(entry.blockers.includes('missing:distribution-package'))
    assert.ok(entry.blockers.includes('missing:buyer-acceptance-evidence'))
  }
})

test('licensing metadata is reported without activating entitlement or fulfillment', () => {
  const report = createPortableCommercialReadinessReport()

  for (const entry of report.entries) {
    const descriptor = portableProductRegistry.find(item => item.manifest.productId === entry.productId)
    assert.equal(entry.licensingAvailable, descriptor?.manifest.licensingAvailable)
    if (!entry.licensingAvailable) assert.ok(entry.blockers.includes('licensing-unavailable'))
  }
})
