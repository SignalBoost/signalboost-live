import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableProductReadinessDashboard, portableProductReadinessDashboard, portableProductRegistry } from '../lib/portable-products/index.ts'
import {
  createPortableCommercialReadinessReport,
  portableCommercialEvidenceKeys,
  portableCommercialReadinessReport,
} from '../lib/portable-products/commercial-readiness.ts'
import { readFileSync } from 'node:fs'

test('portable readiness dashboard is frozen, deterministic, and registry-driven', () => {
  const first = createPortableProductReadinessDashboard(); const second = createPortableProductReadinessDashboard()
  assert.deepEqual(first, second); assert.notEqual(first, second); assert.ok(Object.isFrozen(first) && Object.isFrozen(first.products)); assert.doesNotThrow(() => JSON.stringify(first))
  assert.deepEqual(first.products.map(product => product.productId), portableProductRegistry.map(product => product.manifest.productId))
  for (const product of first.products) {
    assert.ok(Object.isFrozen(product) && Object.isFrozen(product.readiness))
    assert.deepEqual(product.readiness.map(check => check.dimension), ['registry', 'manifest', 'documentation', 'architecture', 'dependencies', 'localization', 'testing', 'security', 'packaging-specification', 'licensing-metadata'])
  }
  assert.equal(portableProductReadinessDashboard.products.find(product => product.productId === 'campaign-studio')?.readyForLicensing, true)
  assert.equal(portableProductReadinessDashboard.products.find(product => product.productId === 'portable-ai-chief-of-staff')?.readyForLicensing, false)
})

test('readiness surfaces remain internal, guarded, and read-only', () => {
  const route = readFileSync(new URL('../app/api/internal/portable-product-readiness/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/dashboard/portable-products/readiness/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /requireAdmin/); assert.match(page, /getCurrentUser/); assert.match(page, /access\.isAdmin/)
  for (const source of [route, page]) for (const forbidden of [/export async function (POST|PUT|PATCH|DELETE)/, /checkout/i, /purchase/i, /activate/i, /download/i, /<form/i, /worker/i, /cos tool/i]) assert.doesNotMatch(source, forbidden)
})

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

test('commercial readiness reports licensing metadata without activating entitlement or fulfillment', () => {
  const report = createPortableCommercialReadinessReport()
  for (const entry of report.entries) {
    const descriptor = portableProductRegistry.find(item => item.manifest.productId === entry.productId)
    assert.equal(entry.licensingAvailable, descriptor?.manifest.licensingAvailable)
    if (!entry.licensingAvailable) assert.ok(entry.blockers.includes('licensing-unavailable'))
  }
})
