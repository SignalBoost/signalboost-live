import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listPublicPortableProducts } from '../lib/portable-products/index.ts'
import { listPortableProductCatalogItems, parsePortableProductCatalogFilters, portableProductCatalogSchemaVersion, serializePortableProductCatalog } from '../lib/portable-products/catalog-serialization.ts'

const route = readFileSync(new URL('../app/api/internal/portable-products/route.ts', import.meta.url), 'utf8')

test('internal portable product route is guarded GET-only metadata inspection', () => {
  assert.match(route, /export async function GET/); assert.match(route, /requireAdmin/)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.doesNotMatch(route, new RegExp(`function ${method}`))
})
test('catalog serializes the bounded registry deterministically and without mutable references', () => {
  const first = serializePortableProductCatalog('2026-01-01T00:00:00.000Z'); const second = serializePortableProductCatalog('2026-01-01T00:00:00.000Z')
  assert.equal(first.schemaVersion, portableProductCatalogSchemaVersion); assert.deepEqual(first, second); assert.doesNotThrow(() => JSON.stringify(first))
  assert.deepEqual(first.items.map(item => item.productId), listPublicPortableProducts().map(item => item.manifest.productId)); assert.ok(first.items.some(item => item.productId === 'agent-operations-platform')); assert.ok(first.items.some(item => item.productId === 'browser-agent-ecosystem')); assert.ok(!first.items.some(item => item.productId === 'durable-agent-runtime'))
  const source = listPortableProductCatalogItems()[0]; const again = listPortableProductCatalogItems()[0]; assert.notEqual(source, again); assert.notEqual(source.supportedLanguages, again.supportedLanguages); assert.ok(Object.isFrozen(source.supportedLanguages))
})
test('catalog supports only strict bounded filters', () => {
  assert.deepEqual(listPortableProductCatalogItems(parsePortableProductCatalogFilters(new URLSearchParams('productId=agent-operations-platform'))).map(item => item.productId), ['agent-operations-platform'])
  assert.ok(listPortableProductCatalogItems(parsePortableProductCatalogFilters(new URLSearchParams('status=preview'))).every(item => item.status === 'preview'))
  assert.ok(listPortableProductCatalogItems(parsePortableProductCatalogFilters(new URLSearchParams('category=operations'))).every(item => item.category === 'operations'))
  assert.ok(listPortableProductCatalogItems(parsePortableProductCatalogFilters(new URLSearchParams('licensingAvailable=true'))).every(item => item.licensingAvailable))
  assert.ok(listPortableProductCatalogItems(parsePortableProductCatalogFilters(new URLSearchParams('publicVisible=true'))).every(item => item.publicVisible))
  for (const query of ['q=anything', 'status=unknown', 'status=preview&status=live', 'productId=unbounded-search']) assert.throws(() => parsePortableProductCatalogFilters(new URLSearchParams(query)), /Invalid portable product catalog filter/)
})
