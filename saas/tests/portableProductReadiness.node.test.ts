import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableProductReadinessDashboard, portableProductReadinessDashboard, portableProductRegistry } from '../lib/portable-products/index.ts'
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
