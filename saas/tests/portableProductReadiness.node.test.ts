import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableBuyerHandoffManifest, createPortableLicensingFulfillmentEvidence, createPortableProductReadinessDashboard, portableProductReadinessDashboard, portableProductRegistry } from '../lib/portable-products/index.ts'
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
  const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({ kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support', path: `handoff/${kind}.json`, sha256: digest, required: false }))
  const manifest = createPortableBuyerHandoffManifest({ productId: 'provider-hub', releaseVersion: '1.0.0', packageFormat: 'tar.gz', artifacts, buyerResponsibilities: ['   '], supplierResponsibilities: [''], exclusions: [] })
  assert.equal(manifest.complete, false)
  assert.ok(manifest.blockers.includes('missing-required-artifact:package'))
  assert.ok(manifest.blockers.includes('missing-required-artifact:support'))
  assert.ok(manifest.blockers.includes('missing-buyer-responsibilities'))
  assert.ok(manifest.blockers.includes('missing-supplier-responsibilities'))
})

test('buyer handoff manifest becomes complete only with all bounded evidence classes', () => {
  const digest = 'a'.repeat(64)
  const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({ kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support', path: `handoff/${kind}.json`, sha256: digest, required: true }))
  const manifest = createPortableBuyerHandoffManifest({ productId: 'provider-hub', releaseVersion: '1.0.0', packageFormat: 'tar.gz', artifacts, buyerResponsibilities: ['Supply provider credentials through the buyer-owned secret boundary.'], supplierResponsibilities: ['Deliver the verified package and documented support boundary.'], exclusions: ['checkout', 'entitlement-activation', 'provider-execution'] })
  assert.equal(manifest.complete, true)
  assert.deepEqual(manifest.blockers, [])
  assert.equal(manifest.schemaVersion, 'portable-buyer-handoff-manifest.v1')
})

test('licensing and fulfillment evidence fails closed when proof is absent', () => {
  const evidence = createPortableLicensingFulfillmentEvidence({
    productId: 'provider-hub',
    licensing: { status: 'absent', references: [] },
    fulfillment: { status: 'absent', references: [] },
    checkoutEnabled: false,
    billingMutationEnabled: false,
    entitlementMutationEnabled: false,
    fulfillmentMutationEnabled: false,
  })
  assert.equal(evidence.complete, false)
  assert.equal(evidence.licensingReady, false)
  assert.equal(evidence.fulfillmentReady, false)
  assert.deepEqual(evidence.blockers, ['missing-licensing-evidence', 'missing-fulfillment-evidence'])
  assert.ok(Object.isFrozen(evidence) && Object.isFrozen(evidence.licensing) && Object.isFrozen(evidence.fulfillment) && Object.isFrozen(evidence.blockers))
})

test('documented evidence requires references and rejects mutation claims', () => {
  const evidence = createPortableLicensingFulfillmentEvidence({
    productId: 'provider-hub',
    licensing: { status: 'documented', references: ['   '] },
    fulfillment: { status: 'verified', references: ['docs/handoff/provider-hub.md'] },
    checkoutEnabled: true,
    billingMutationEnabled: false,
    entitlementMutationEnabled: true,
    fulfillmentMutationEnabled: false,
  })
  assert.equal(evidence.complete, false)
  assert.ok(evidence.blockers.includes('missing-licensing-references'))
  assert.ok(evidence.blockers.includes('checkout-enabled'))
  assert.ok(evidence.blockers.includes('entitlement-mutation-enabled'))
})

test('licensing and fulfillment evidence completes only as read-only proof', () => {
  const evidence = createPortableLicensingFulfillmentEvidence({
    productId: 'provider-hub',
    licensing: { status: 'verified', references: ['contracts/provider-hub-license-boundary.v1.json'] },
    fulfillment: { status: 'verified', references: ['handoff/provider-hub-release.v1.json'] },
    checkoutEnabled: false,
    billingMutationEnabled: false,
    entitlementMutationEnabled: false,
    fulfillmentMutationEnabled: false,
  })
  assert.equal(evidence.complete, true)
  assert.equal(evidence.licensingReady, true)
  assert.equal(evidence.fulfillmentReady, true)
  assert.deepEqual(evidence.blockers, [])
  assert.equal(evidence.schemaVersion, 'portable-licensing-fulfillment-evidence.v1')
})
