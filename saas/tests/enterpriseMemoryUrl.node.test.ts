// saas/tests/enterpriseMemoryUrl.node.test.ts
//
// Issue #205 Section 1.2 / Section 7 — Enterprise Memory URL dedup guarantees.
// These pin the core correctness property of Enterprise Memory: URL variants that
// represent the same property must produce ONE canonical identity and ONE
// fingerprint, so the platform never creates duplicate organization records or
// re-analyzes the same site. Pure functions, no DB, no network.
//
// Run: node --test tests/enterpriseMemoryUrl.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalDomainOf, createUrlFingerprint, normalizeUrl } from '../lib/enterprise/memory/urlCanonical.ts'

const VARIANTS = [
  'https://example.com',
  'https://www.example.com/',
  'http://example.com',
  'https://example.com/?utm_source=test',
  'https://EXAMPLE.com',
  'example.com',
  'https://example.com//',
  'https://example.com/?utm_source=x&utm_medium=y',
]

test('all common variants collapse to one canonical URL', () => {
  const canonicals = new Set(VARIANTS.map((v) => normalizeUrl(v).canonicalUrl))
  assert.equal(canonicals.size, 1, `expected 1 canonical, got ${[...canonicals].join(', ')}`)
  assert.equal([...canonicals][0], 'https://example.com/')
})

test('all common variants share one fingerprint (dedup key)', () => {
  const fps = new Set(VARIANTS.map(createUrlFingerprint))
  assert.equal(fps.size, 1, 'variants must not create separate organization records')
})

test('canonical domain strips www and lowercases', () => {
  assert.equal(canonicalDomainOf('https://WWW.Example.com/path'), 'example.com')
})

test('genuinely different properties keep distinct fingerprints', () => {
  const a = createUrlFingerprint('https://example.com')
  const b = createUrlFingerprint('https://example.org')
  const c = createUrlFingerprint('https://sub.example.com')
  assert.notEqual(a, b)
  assert.notEqual(a, c)
})

test('meaningful path and query are preserved and order-stable', () => {
  const one = normalizeUrl('https://example.com/pricing?b=2&a=1').canonicalUrl
  const two = normalizeUrl('https://example.com/pricing?a=1&b=2').canonicalUrl
  assert.equal(one, two)
  assert.equal(one, 'https://example.com/pricing?a=1&b=2')
})

test('tracking params are stripped but real params survive', () => {
  const out = normalizeUrl('https://example.com/x?utm_source=ads&id=42&fbclid=zzz').canonicalUrl
  assert.equal(out, 'https://example.com/x?id=42')
})

test('rejects non-http(s) and empty input', () => {
  assert.throws(() => normalizeUrl(''))
  assert.throws(() => normalizeUrl('ftp://example.com'))
  assert.throws(() => normalizeUrl('mailto:x@example.com'))
})

test('fingerprint is stable and hex, 40 chars', () => {
  const fp = createUrlFingerprint('https://example.com')
  assert.match(fp, /^[0-9a-f]{40}$/)
  assert.equal(fp, createUrlFingerprint('https://www.example.com/'))
})
