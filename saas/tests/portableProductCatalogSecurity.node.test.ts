import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { serializePortableProductCatalog } from '../lib/portable-products/catalog-serialization.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const serializer = hydrateLocalizedSource(readFileSync(new URL('../lib/portable-products/catalog-serialization.ts', import.meta.url), 'utf8'))
const route = hydrateLocalizedSource(readFileSync(new URL('../app/api/internal/portable-products/route.ts', import.meta.url), 'utf8'))

test('serializer is a detached metadata allowlist with no runtime, secret, or execution boundary', () => {
  for (const forbidden of [/process\.env/, /\bfetch\s*\(/, /supabase/i, /node:fs|readFile|writeFile/, /child_process|\bexec\s*\(/, /playwright|puppeteer|browser-provider|browser-runtime/i, /credential|api[_-]?key|password|bearer\s|secret[_-]?key/i, /checkout/i, /license activation/i, /package generation/i, /worker/i, /cos tool/i]) assert.doesNotMatch(serializer, forbidden)
  assert.doesNotMatch(serializer, /\.\.\.manifest|\.\.\.product/); assert.match(serializer, /productId: manifest\.productId/)
  const result = serializePortableProductCatalog('2026-01-01T00:00:00.000Z'); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.items)); assert.ok(result.items.every(item => Object.isFrozen(item)))
})
test('route is internal, guarded, GET-only, and has no projection or sorting surface', () => {
  assert.match(route, /requireAdmin/); assert.match(route, /parsePortableProductCatalogFilters/)
  for (const forbidden of [/export async function (POST|PUT|PATCH|DELETE)/, /sort=/i, /fields=/i, /select=/i, /checkout/i, /license activation/i, /package generation/i, /worker/i, /cos tool/i]) assert.doesNotMatch(route, forbidden)
})
