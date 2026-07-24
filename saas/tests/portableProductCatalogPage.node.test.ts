import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/dashboard/portable-products/page.tsx', import.meta.url), 'utf8')
const homepage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')

test('internal catalog page reuses dashboard access and registry-backed serialization', () => {
  assert.match(page, /export default async function PortableProductsPage/); assert.match(page, /getCurrentUser/); assert.match(page, /getAccess/); assert.match(page, /access\.isAdmin/); assert.match(page, /listPortableProductCatalogItems/)
  for (const label of ['productId', 'status', 'maturity', 'category', 'licensingAvailable', 'architectureReferences', 'documentationReferences', 'dependencies', 'exclusions']) assert.match(page, new RegExp(label))
  for (const filter of ['statuses', 'categories', 'publicVisible', 'licensingAvailable']) assert.match(page, new RegExp(filter))
})
test('catalog page stays read-only and does not alter the public homepage', () => {
  for (const forbidden of [/checkout/i, /purchase/i, /edit button/i, /activate/i, /download/i, /delete/i, /<form/i, /method=['"](?:post|put|patch|delete)/i]) assert.doesNotMatch(page, forbidden)
  assert.match(homepage, /listPublicPortableProducts/); assert.doesNotMatch(homepage, /dashboard\/portable-products/)
})
