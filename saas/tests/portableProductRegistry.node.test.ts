import test from 'node:test'
import assert from 'node:assert/strict'
import { getPortableProduct, listLicensablePortableProducts, listPortableProducts, listPublicPortableProducts, portableProductRegistry, validatePortableProductRegistry } from '../lib/portable-products/index.ts'

test('registry is frozen, serializable, and has customer-facing stable IDs', () => {
  assert.ok(portableProductRegistry.length > 0)
  assert.ok(Object.isFrozen(portableProductRegistry))
  const ids = portableProductRegistry.map(product => product.productId)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('agent-operations-platform')); assert.ok(ids.includes('browser-agent-ecosystem')); assert.ok(!ids.includes('agentRuntime'))
  for (const product of portableProductRegistry) {
    assert.match(product.productId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(Object.isFrozen(product)); assert.ok(Object.isFrozen(product.capabilityTags)); assert.ok(Object.isFrozen(product.documentationReferences)); assert.ok(Object.isFrozen(product.architectureReferences))
    assert.equal(new Set(product.capabilityTags).size, product.capabilityTags.length)
    assert.doesNotThrow(() => JSON.stringify(product))
  }
})
test('selectors are deterministic and apply public and licensing rules', () => {
  const first = listPortableProducts(); const second = listPortableProducts()
  assert.deepEqual(first.map(product => product.productId), second.map(product => product.productId)); assert.ok(Object.isFrozen(first)); assert.notEqual(first, second)
  assert.deepEqual(first.map(product => product.sortOrder), [...first].map(product => product.sortOrder).sort((a, b) => a - b))
  assert.ok(listPublicPortableProducts().every(product => product.publicVisible && product.status !== 'internal' && product.status !== 'hidden' && product.status !== 'deprecated'))
  assert.ok(listLicensablePortableProducts().every(product => product.licensingAvailable && product.status === 'live'))
})
test('product lookups, routes, and documentation metadata are safe', () => {
  assert.throws(() => getPortableProduct('unknown-portable'), /Unknown portable product ID/)
  for (const product of portableProductRegistry) {
    assert.ok(product.route === undefined || (product.route.startsWith('/') && !product.route.startsWith('//')))
    for (const reference of [...product.documentationReferences, ...product.architectureReferences]) assert.match(reference, /^(docs|saas)\//)
  }
})

test('validation rejects implementation mismatches and undeclared metadata fields', () => {
  const descriptor = portableProductRegistry[0]
  const invalidStatus = Object.freeze({
    ...descriptor,
    implementationStatus: 'unknown',
    documentationReferences: descriptor.documentationReferences,
    capabilityTags: descriptor.capabilityTags,
    architectureReferences: descriptor.architectureReferences,
  })
  assert.throws(() => validatePortableProductRegistry(Object.freeze([invalidStatus] as never)), /invalid implementation status/)

  const undeclaredField = Object.freeze({
    ...descriptor,
    undocumentedMetadata: 'not allowed',
    documentationReferences: descriptor.documentationReferences,
    capabilityTags: descriptor.capabilityTags,
    architectureReferences: descriptor.architectureReferences,
  })
  assert.throws(() => validatePortableProductRegistry(Object.freeze([undeclaredField] as never)), /not an allowed descriptor field/)
})
