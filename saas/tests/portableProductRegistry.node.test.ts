import test from 'node:test'
import assert from 'node:assert/strict'
import { getPortableProduct, listLicensablePortableProducts, listPortableProducts, listPublicPortableProducts, portableProductRegistry, validatePortableProductRegistry } from '../lib/portable-products/index.ts'

test('registry is frozen and preserves stable customer-facing manifest IDs', () => {
  assert.ok(Object.isFrozen(portableProductRegistry))
  const ids = portableProductRegistry.map(product => product.manifest.productId)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('agent-operations-platform')); assert.ok(ids.includes('browser-agent-ecosystem')); assert.ok(!ids.includes('agentRuntime'))
  for (const product of portableProductRegistry) assert.ok(Object.isFrozen(product) && Object.isFrozen(product.manifest))
})
test('selectors are deterministic and apply manifest visibility and licensing rules', () => {
  const first = listPortableProducts(); const second = listPortableProducts()
  assert.deepEqual(first.map(product => product.manifest.productId), second.map(product => product.manifest.productId)); assert.ok(Object.isFrozen(first)); assert.notEqual(first, second)
  assert.ok(listPublicPortableProducts().every(product => product.manifest.publicVisible && product.manifest.status !== 'internal' && product.manifest.status !== 'hidden' && product.manifest.status !== 'deprecated'))
  assert.ok(listLicensablePortableProducts().every(product => product.manifest.licensingAvailable && product.manifest.status === 'live'))
})
test('product lookups and routes remain safe', () => {
  assert.throws(() => getPortableProduct('unknown-portable'), /Unknown portable product ID/)
  for (const product of portableProductRegistry) assert.ok(product.route === undefined || (product.route.startsWith('/') && !product.route.startsWith('//')))
})
test('registry validation rejects invalid implementation status and duplicate manifest IDs', () => {
  const descriptor = portableProductRegistry[0]
  assert.throws(() => validatePortableProductRegistry(Object.freeze([Object.freeze({ ...descriptor, implementationStatus: 'unknown' })] as never)), /invalid implementation status/)
  assert.throws(() => validatePortableProductRegistry(Object.freeze([descriptor, portableProductRegistry[0]])), /duplicate productId/)
})