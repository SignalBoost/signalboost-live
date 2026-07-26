import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableBuyerHandoffManifest, createPortableProductReadinessDashboard, portableProductReadinessDashboard, portableProductRegistry } from '../lib/portable-products/index.ts'
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

test('buyer handoff manifest is immutable and fails closed when delivery evidence is incomplete', () => {
  const manifest = createPortableBuyerHandoffManifest({ productId: 'provider-hub', releaseVersion: '1.0.0', packageFormat: 'tar.gz', artifacts: [], buyerResponsibilities: [], supplierResponsibilities: [], exclusions: ['checkout', 'entitlement-activation', 'provider-execution'] })
  assert.equal(manifest.complete, false)
  assert.ok(manifest.blockers.includes('missing-required-artifact:package'))
  assert.ok(manifest.blockers.includes('missing-required-artifact:acceptance'))
  assert.ok(manifest.blockers.includes('missing-buyer-responsibilities'))
  assert.ok(Object.isFrozen(manifest) && Object.isFrozen(manifest.artifacts) && Object.isFrozen(manifest.blockers))
})

test('buyer handoff manifest rejects optional required classes and blank responsibility boundaries', () => {
  const digest = 'a'.repeat(64)
  const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({ kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support', path: `docs/handoff/${kind}.json`, sha256: digest, required: false }))
  const manifest = createPortableBuyerHandoffManifest({ productId: 'provider-hub', releaseVersion: '1.0.0', packageFormat: 'tar.gz', artifacts, buyerResponsibilities: ['   '], supplierResponsibilities: [''], exclusions: [] })
  assert.equal(manifest.complete, false)
  assert.ok(manifest.blockers.includes('missing-required-artifact:package'))
  assert.ok(manifest.blockers.includes('missing-required-artifact:support'))
  assert.ok(manifest.blockers.includes('missing-buyer-responsibilities'))
  assert.ok(manifest.blockers.includes('missing-supplier-responsibilities'))
})

test('buyer handoff manifest becomes complete only with all bounded evidence classes', () => {
  const digest = 'a'.repeat(64)
  const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({ kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support', path: `docs/handoff/${kind}.json`, sha256: digest, required: true }))
  const manifest = createPortableBuyerHandoffManifest({
    productId: 'provider-hub',
    releaseVersion: '1.0.0',
    packageFormat: 'tar.gz',
    artifacts,
    buyerResponsibilities: ['Supply provider credentials through the buyer-owned secret boundary.'],
    supplierResponsibilities: ['Deliver the verified package and documented support boundary.'],
    exclusions: ['checkout', 'entitlement-activation', 'provider-execution'],
    preparedAt: '2026-07-26T20:00:00.000Z',
    acknowledgedAt: '2026-07-26T20:05:00.000Z',
    artifactTransferred: false,
    credentialsTransferred: false,
    entitlementMutated: false,
    deploymentPerformed: false,
    productionExecutionEnabled: false,
  })
  assert.equal(manifest.complete, true)
  assert.deepEqual(manifest.blockers, [])
  assert.equal(manifest.schemaVersion, 'portable-buyer-handoff-manifest.v2')
  assert.equal(manifest.readOnly, true)
})
