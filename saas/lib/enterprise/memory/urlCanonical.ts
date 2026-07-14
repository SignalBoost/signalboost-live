// saas/lib/enterprise/memory/urlCanonical.ts
// Issue #205 Section 1.2 — single authoritative URL normalization + fingerprinting.
// Pure functions, no I/O. Everything that dedupes an organization goes through here
// so that https://example.com, https://www.example.com/, http://example.com, and
// https://example.com/?utm_source=test all resolve to ONE canonical identity.

import { createHash } from 'node:crypto'

// Query params that never identify a distinct property — stripped before fingerprinting.
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'ref', 'ref_src',
  '_hsenc', '_hsmi', 'igshid', 'yclid', 'dclid', 'twclid', 'wbraid', 'gbraid',
])

const STRIP_WWW = /^www\./i

export type CanonicalUrl = {
  canonicalUrl: string
  canonicalDomain: string
  hostname: string
}

// Normalize a URL to a stable canonical form. Throws on structurally invalid input;
// callers that need SSRF/DNS safety must still use safeFetch — this is string-level only.
export function normalizeUrl(input: string): CanonicalUrl {
  const trimmed = (input || '').trim()
  if (!trimmed) throw new Error('A URL is required.')

  // Reject any explicit non-http(s) scheme (ftp:, mailto:, javascript:, etc.).
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) {
    throw new Error('Only HTTP and HTTPS URLs are supported.')
  }
  // Allow scheme-less input like "example.com/path".
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withScheme)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.')
  }

  // Hostname: lowercase, drop trailing dot, drop a leading www.
  let hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const canonicalDomain = hostname.replace(STRIP_WWW, '')
  hostname = canonicalDomain

  // Drop default ports.
  const port = url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))
    ? `:${url.port}`
    : ''

  // Path: collapse duplicate slashes, drop a lone trailing slash (but keep "/").
  let path = url.pathname.replace(/\/{2,}/g, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (!path) path = '/'

  // Query: drop tracking params, sort the rest for stability.
  const params = new URLSearchParams(url.search)
  const kept: [string, string][] = []
  for (const [key, value] of params) {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) kept.push([key, value])
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = kept.length ? `?${kept.map(([k, v]) => `${k}=${v}`).join('&')}` : ''

  // Canonical form always uses https and the www-stripped host; fragment dropped.
  const canonicalUrl = `https://${hostname}${port}${path}${query}`
  return { canonicalUrl, canonicalDomain, hostname }
}

// Stable fingerprint for dedup lookups. Same canonical URL -> same fingerprint.
export function createUrlFingerprint(input: string): string {
  const { canonicalUrl } = normalizeUrl(input)
  return createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 40)
}

// Domain-level fingerprint — used to collapse all pages of one property to one org.
export function canonicalDomainOf(input: string): string {
  return normalizeUrl(input).canonicalDomain
}
